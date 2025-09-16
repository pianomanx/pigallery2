import {ProjectPath} from '../../ProjectPath';
import {Config} from '../../../common/config/private/Config';
import * as fs from 'fs';
import * as path from 'path';
import {pipeline} from 'stream/promises';
import {Readable} from 'stream';
import {IObjectManager} from '../database/IObjectManager';
import {Logger} from '../../Logger';
import {IExtensionEvents, IExtensionObject} from './IExtension';
import {Server} from '../../server';
import {ExtensionEvent} from './ExtensionEvent';
import * as express from 'express';
import {SQLConnection} from '../database/SQLConnection';
import {ExtensionObject} from './ExtensionObject';
import {ExtensionDecoratorObject} from './ExtensionDecorator';
import * as util from 'util';
import * as AdmZip from 'adm-zip';
import {ServerExtensionsEntryConfig} from '../../../common/config/private/subconfigs/ServerExtensionsConfig';
import {ExtensionRepository} from './ExtensionRepository';
import {ExtensionListItem} from '../../../common/entities/extension/ExtensionListItem';
import {ExtensionConfigTemplateLoader} from './ExtensionConfigTemplateLoader';
import {Utils} from '../../../common/Utils';
import {UIExtensionDTO} from '../../../common/entities/extension/IClientUIConfig';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const exec = util.promisify(require('child_process').exec);
const LOG_TAG = '[ExtensionManager]';

export class ExtensionManager implements IObjectManager {

  public static EXTENSION_API_PATH = Config.Server.apiPath + '/extension';
  public repository: ExtensionRepository = new ExtensionRepository();

  events: IExtensionEvents;
  extObjects: { [key: string]: ExtensionObject<unknown> } = {};
  router: express.Router;

  constructor() {
    this.initEvents();
  }


  public async init() {
    this.extObjects = {};
    this.initEvents();
    if (!Config.Extensions.enabled) {
      return;
    }
    this.router = express.Router();
    Server.instance?.app.use(ExtensionManager.EXTENSION_API_PATH, this.router);
    await this.initExtensions();
  }

  public async getExtensionListWithInstallStatus(): Promise<ExtensionListItem[]> {
    const extensionList = await this.repository.getExtensionList();

    // Add installed status to each extension
    return extensionList.map(extension => {
      // Check if the extension is installed by looking for its name in the installed extensions
      const isInstalled = Array.from(Config.Extensions.extensions.keys()).some(
        key => key.toLowerCase() === extension.id.toLowerCase()
      );

      return {
        ...extension,
        installed: isInstalled
      };
    });
  }

  public async cleanUp() {
    if (!Config.Extensions.enabled) {
      return;
    }
    this.initEvents(); // reset events
    await this.cleanUpExtensions();
    Server.instance?.app.use(ExtensionManager.EXTENSION_API_PATH, this.router);
    this.extObjects = {};
  }

  public async installExtension(extensionId: string): Promise<void> {
    if (!Config.Extensions.enabled) {
      throw new Error('Extensions are disabled');
    }

    Logger.debug(LOG_TAG, `Installing extension with ID: ${extensionId}`);

    // Get the extension list
    const extensionList = await this.repository.getExtensionList();

    // Find the extension with the given ID
    const extension = extensionList.find(ext => ext.id.toLowerCase() === extensionId.toLowerCase());

    if (!extension) {
      throw new Error(`Extension with ID ${extensionId} not found`);
    }

    if (!extension.zipUrl) {
      throw new Error(`Extension ${extensionId} does not have a zip URL`);
    }

    // Download the zip file
    const zipFilePath = path.join(ProjectPath.ExtensionFolder, `${extensionId}.zip`);
    Logger.silly(LOG_TAG, `Downloading extension from ${extension.zipUrl} to ${zipFilePath}`);

    await this.downloadFile(extension.zipUrl, zipFilePath);

    // Create the extension directory
    const extensionDir = path.join(ProjectPath.ExtensionFolder, extensionId);
    if (!fs.existsSync(extensionDir)) {
      await fs.promises.mkdir(extensionDir, {recursive: true});
    }

    // Unzip the file
    Logger.silly(LOG_TAG, `Unzipping extension to ${extensionDir}`);
    await this.unzipFile(zipFilePath, extensionDir);

    // Update the configuration
    Logger.silly(LOG_TAG, `Updating configuration for extension ${extensionId}`);

    ExtensionConfigTemplateLoader.Instance.loadSingleExtension(extensionId, Config);

    // Initialize the extension
    Logger.silly(LOG_TAG, `Initializing extension ${extensionId}`);
    await this.initSingleExtension(extensionId);

    // Clean up the temporary file
    if (fs.existsSync(zipFilePath)) {
      fs.unlinkSync(zipFilePath);
    }

    Logger.debug(LOG_TAG, `Extension ${extensionId} installed successfully`);
  }

  getUIExtensionConfigs(): UIExtensionDTO[] {
    return Object.values(this.extObjects)
      .filter(obj => !!obj.ui?.buttonConfigs?.length)
      .map(obj => ({
        mediaButtons: obj.ui.buttonConfigs,
        extensionBasePath: Utils.concatUrls('/extension', obj.extensionId)
      }));
  }

  private initEvents() {
    this.events = {
      gallery: {
        MetadataLoader: {
          loadPhotoMetadata: new ExtensionEvent(),
          loadVideoMetadata: new ExtensionEvent()
        },
        CoverManager: {
          getCoverForDirectory: new ExtensionEvent(),
          getCoverForAlbum: new ExtensionEvent(),
        },
        ProjectedCacheManager: {
          invalidateDirectoryCache: new ExtensionEvent()
        },
        DiskManager: {
          excludeDir: new ExtensionEvent(),
          scanDirectory: new ExtensionEvent()
        },
        ImageRenderer: {
          render: new ExtensionEvent()
        }
      }
    };
    ExtensionDecoratorObject.init(this.events);
  }

  private createUniqueExtensionObject(name: string, folder: string): IExtensionObject<unknown> {
    let id = name;
    if (this.extObjects[id]) {
      let i = 0;
      while (this.extObjects[`${name}_${++i}`]) { /* empty */
      }
      id = `${name}_${++i}`;
    }
    if (!this.extObjects[id]) {
      this.extObjects[id] = new ExtensionObject(id, name, folder, this.router, this.events);
    }
    return this.extObjects[id];
  }

  /**
   * Initialize a single extension
   * @param extId The id of the extension
   * @returns Promise that resolves when the extension is initialized
   */
  private async initSingleExtension(extId: string): Promise<void> {
    const extConf: ServerExtensionsEntryConfig = Config.Extensions.extensions[extId] as ServerExtensionsEntryConfig;
    if (!extConf) {
      Logger.silly(LOG_TAG, `Skipping ${extId} initiation. Extension config is missing.`);
      return;
    }
    const extFolder = extConf.path;
    let extName = extFolder;

    if (extConf.enabled === false) {
      Logger.silly(LOG_TAG, `Skipping ${extFolder} initiation. Extension is disabled.`);
      return;
    }

    const extPath = path.join(ProjectPath.ExtensionFolder, extFolder);
    const serverExtPath = path.join(extPath, 'server.js');
    const packageJsonPath = path.join(extPath, 'package.json');

    if (!fs.existsSync(serverExtPath)) {
      Logger.silly(LOG_TAG, `Skipping ${extFolder} server initiation. server.js does not exists`);
      return;
    }

    if (fs.existsSync(packageJsonPath)) {
      if (fs.existsSync(path.join(extPath, 'node_modules'))) {
        Logger.debug(LOG_TAG, `node_modules folder exists. Skipping "npm install".`);
      } else {
        Logger.silly(LOG_TAG, `Running: "npm install --prefer-offline --no-audit --progress=false --omit=dev" in ${extPath}`);
        await exec('npm install  --no-audit --progress=false --omit=dev', {
          cwd: extPath
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pkg = require(packageJsonPath);
      if (pkg.name) {
        extName = pkg.name;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ext = require(serverExtPath);
    if (typeof ext?.init === 'function') {
      Logger.debug(LOG_TAG, 'Running init on extension: ' + extFolder);
      await ext?.init(this.createUniqueExtensionObject(extName, extFolder));
    }
  }

  /**
   * Initialize all extensions
   */
  private async initExtensions() {
    for (const prop of Config.Extensions.extensions.keys()) {
      await this.initSingleExtension(prop);
    }

    if (Config.Extensions.cleanUpUnusedTables) {
      // Clean up tables after all Extension was initialized.
      await SQLConnection.removeUnusedTables();
    }
  }

  private async cleanUpExtensions() {
    for (const extObj of Object.values(this.extObjects)) {
      const serverExt = path.join(extObj.folder, 'server.js');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ext = require(serverExt);
      if (typeof ext?.cleanUp === 'function') {
        Logger.debug(LOG_TAG, 'Running Init on extension:' + extObj.extensionName);
        await ext?.cleanUp(extObj);
      }
      extObj.messengers.cleanUp();
    }
  }

  private async downloadFile(url: string, outputPath: string): Promise<void> {
    const response = await fetch(url);

    if (!response.ok || !response.body) {
      throw new Error(`Unexpected response ${response.statusText}`);
    }

    const nodeReadable = Readable.fromWeb(response.body as any);

    // Pipe the response body to a file
    await pipeline(nodeReadable, fs.createWriteStream(outputPath));
  }

  private async unzipFile(zipFilePath: string, outputPath: string): Promise<void> {
    try {
      // Extract to temp first
      const tempExtractPath = path.join(outputPath, '__temp_unzip');

      const zip = new AdmZip(zipFilePath);
      zip.extractAllTo(tempExtractPath, true);

      // Flatten directory
      // Check for single subdirectory
      const entries = fs.readdirSync(tempExtractPath);
      if (entries.length === 1) {
        const singleDirPath = path.join(tempExtractPath, entries[0]);
        const stat = fs.statSync(singleDirPath);

        if (stat.isDirectory()) {
          const innerFiles = fs.readdirSync(singleDirPath);

          // Move contents of the inner folder to outputPath
          innerFiles.forEach((file) => {
            const src = path.join(singleDirPath, file);
            const dest = path.join(outputPath, file);
            fs.renameSync(src, dest);
          });

          // Remove the temp and wrapper folder
          fs.rmSync(tempExtractPath, {recursive: true, force: true});

          console.log('Flattened and extracted successfully.');
        } else {
          // It's not a folder, just move it directly
          fs.renameSync(singleDirPath, path.join(outputPath, entries[0]));
          fs.rmSync(tempExtractPath, {recursive: true, force: true});
          console.log('Moved single file directly.');
        }
      } else {
        // Multiple entries, just move all
        entries.forEach((entry) => {
          const src = path.join(tempExtractPath, entry);
          const dest = path.join(outputPath, entry);
          fs.renameSync(src, dest);
        });

        fs.rmSync(tempExtractPath, {recursive: true, force: true});
        console.log('Extracted with multiple top-level items.');
      }
    } catch (error) {
      Logger.error(LOG_TAG, `Error unzipping file: ${error}`);
      throw new Error(`Failed to unzip file: ${error}`);
    }
  }
}
