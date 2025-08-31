import {Brackets, WhereExpression} from 'typeorm';
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
import {Config} from '../../../common/config/private/Config';
import {DatabaseType} from '../../../common/config/private/PrivateConfig';
import {Logger} from '../../Logger';
import {SessionManager} from './SessionManager';

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

    // Build subquery to select directories: the dir itself and all of its descendants
    const subQ = connection
      .getRepository(DirectoryEntity)
      .createQueryBuilder('directory')
      .select('directory.id')
      .where(
        new Brackets((q: WhereExpression) => {
          q.where('directory.path = :dirPath AND directory.name = :dirName', {
            dirPath: dir.path,
            dirName: dir.name,
          });

          if (Config.Database.type === DatabaseType.mysql) {
            q.orWhere('directory.path like :pathLike', {
              pathLike: DiskManager.pathFromParent(dir) + '%',
            });
          } else {
            q.orWhere('directory.path GLOB :pathGlob', {
              pathGlob:
                DiskManager.pathFromParent(dir).replaceAll('[', '[[]') + '*',
            });
          }
        })
      );

    await connection
      .createQueryBuilder()
      .update(ProjectedDirectoryCacheEntity)
      .set({valid: false})
      .where(`directoryId IN (${subQ.getQuery()})`)
      .setParameters(subQ.getParameters())
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
