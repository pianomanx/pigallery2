import {Brackets} from 'typeorm';
import {SQLConnection} from './SQLConnection';
import {ProjectedDirectoryCacheEntity} from './enitites/ProjectedDirectoryCacheEntity';
import {DirectoryEntity} from './enitites/DirectoryEntity';
import {ObjectManagers} from '../ObjectManagers';
import {UserEntity} from './enitites/UserEntity';
import {SharingEntity} from './enitites/SharingEntity';
import {IObjectManager} from './IObjectManager';
import {ParentDirectoryDTO} from '../../../common/entities/DirectoryDTO';
import {DiskManager} from '../fileaccess/DiskManager';
import {ExtensionDecorator} from '../extension/ExtensionDecorator';
import {Logger} from '../../Logger';
import {SessionManager} from './SessionManager';
import * as path from 'path';

const LOG_TAG = '[ProjectedCacheManager]';

export class ProjectedCacheManager implements IObjectManager {

  async init(): Promise<void> {
    // Cleanup at startup to avoid stale growth
    await this.cleanupNonExistingProjections();
  }

  public async onNewDataVersion(changedDir?: ParentDirectoryDTO): Promise<void> {
    if (!changedDir) {
      return;
    }
    await this.invalidateDirectoryCache(changedDir);
  }

  @ExtensionDecorator(e => e.gallery.ProjectedCacheManager.invalidateDirectoryCache)
  protected async invalidateDirectoryCache(dir: ParentDirectoryDTO) {
    const connection = await SQLConnection.getConnection();
    const dirRepo = connection.getRepository(DirectoryEntity);

    // Collect directory paths from target to root
    const paths: { path: string; name: string }[] = [];
    let fullPath = DiskManager.normalizeDirPath(path.join(dir.path, dir.name));
    const root = DiskManager.pathFromRelativeDirName('.');

    // Build path-name pairs for current directory and all parents
    while (fullPath !== root) {
      const name = DiskManager.dirName(fullPath);
      const parentPath = DiskManager.pathFromRelativeDirName(fullPath);
      paths.push({path: parentPath, name});
      fullPath = parentPath;
    }

    // Add root directory
    paths.push({path: DiskManager.pathFromRelativeDirName(root), name: DiskManager.dirName(root)});

    if (paths.length === 0) {
      return;
    }

    // Build query for all directories in one shot
    const qb = dirRepo.createQueryBuilder('d');
    paths.forEach((p, i) => {
      qb.orWhere(new Brackets(q => {
        q.where(`d.path = :path${i}`, {[`path${i}`]: p.path})
          .andWhere(`d.name = :name${i}`, {[`name${i}`]: p.name});
      }));
    });

    // Find matching directories and invalidate their cache entries
    const entities = await qb.getMany();
    if (entities.length === 0) {
      return;
    }

    // Invalidate all related cache entries in one operation
    await connection.getRepository(ProjectedDirectoryCacheEntity)
      .createQueryBuilder()
      .update()
      .set({valid: false})
      .where('directoryId IN (:...dirIds)', {dirIds: entities.map(e => e.id)})
      .execute();
  }

  public async getAllProjections(): Promise<string[]> {
    const connection = await SQLConnection.getConnection();
    const activeKeys = new Set<string>();

    // Always include default projection key
    activeKeys.add(SessionManager.NO_PROJECTION_KEY);

    // Users
    const users = await connection.getRepository(UserEntity).find();
    for (const user of users) {
      const ctx = await ObjectManagers.getInstance().SessionManager.buildContext(user);
      if (ctx?.user?.projectionKey) {
        activeKeys.add(ctx.user.projectionKey);
      }
    }

    // Sharings
    const shares = await connection.getRepository(SharingEntity)
      .createQueryBuilder('share')
      .leftJoinAndSelect('share.creator', 'creator')
      .getMany();
    for (const s of shares) {
      const q = ObjectManagers.getInstance().SessionManager.buildAllowListForSharing(s);
      const key = ObjectManagers.getInstance().SessionManager.createProjectionKey(q);
      activeKeys.add(key);
    }

    return Array.from(activeKeys);
  }

  public async cleanupNonExistingProjections(): Promise<void> {
    const connection = await SQLConnection.getConnection();
    const keys = await this.getAllProjections();
    Logger.debug(LOG_TAG, 'Cleanup non existing projections, known number of keys: ' + keys.length);
    if (keys.length === 0) {
      // No known projections; nothing to prune safely
      return;
    }

    await connection.getRepository(ProjectedDirectoryCacheEntity)
      .createQueryBuilder()
      .delete()
      .where('projectionKey NOT IN (:...keys)', {keys})
      .execute();
  }
}
