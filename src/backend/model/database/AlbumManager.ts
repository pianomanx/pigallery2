import {SQLConnection} from './SQLConnection';
import {AlbumBaseEntity} from './enitites/album/AlbumBaseEntity';
import {AlbumBaseDTO} from '../../../common/entities/album/AlbumBaseDTO';
import {ObjectManagers} from '../ObjectManagers';
import {SearchQueryDTO} from '../../../common/entities/SearchQueryDTO';
import {SavedSearchEntity} from './enitites/album/SavedSearchEntity';
import {Logger} from '../../Logger';
import {SessionContext} from '../SessionContext';
import {ProjectedAlbumCacheEntity} from './enitites/album/ProjectedAlbumCacheEntity';
import {ProjectionAwareManager} from './ProjectionAwareManager';

const LOG_TAG = '[AlbumManager]';

export class AlbumManager extends ProjectionAwareManager<AlbumBaseEntity> {

  public async addIfNotExistSavedSearch(
    name: string,
    searchQuery: SearchQueryDTO,
    lockedAlbum: boolean
  ): Promise<void> {
    const connection = await SQLConnection.getConnection();
    const album = await connection
      .getRepository(SavedSearchEntity)
      .findOneBy({name, searchQuery});
    if (album) {
      return;
    }
    await this.addSavedSearch(name, searchQuery, lockedAlbum);
  }

  public async addSavedSearch(
    name: string,
    searchQuery: SearchQueryDTO,
    lockedAlbum?: boolean
  ): Promise<void> {
    const connection = await SQLConnection.getConnection();
    await connection
      .getRepository(SavedSearchEntity)
      .save({name, searchQuery, locked: lockedAlbum});
  }

  public async deleteAlbum(id: number): Promise<void> {
    const connection = await SQLConnection.getConnection();

    if (
      (await connection
        .getRepository(AlbumBaseEntity)
        .countBy({id, locked: false})) !== 1
    ) {
      throw new Error('Could not delete album, id:' + id);
    }

    await connection
      .getRepository(AlbumBaseEntity)
      .delete({id, locked: false});
  }


  protected async loadEntities(session: SessionContext): Promise<AlbumBaseEntity[]> {
    Logger.debug(LOG_TAG, 'loadEntities called for projection key:', session.user.projectionKey);
    await this.updateAlbums(session);
    const connection = await SQLConnection.getConnection();

    // Return albums with projected cache data
    const result = await connection
      .getRepository(AlbumBaseEntity)
      .createQueryBuilder('album')
      .leftJoin('album.cache', 'cache', 'cache.projectionKey = :pk AND cache.valid = 1', {pk: session.user.projectionKey})
      .leftJoin('cache.cover', 'cover')
      .leftJoin('cover.directory', 'directory')
      .select(['album', 'cache', 'cover.name', 'directory.name', 'directory.path'])
      .getMany();

    Logger.debug(LOG_TAG, 'loadEntities returning', result.length, 'albums');
    return result;
  }

  protected async invalidateDBCache(): Promise<void> {
    // Invalidate all album cache entries
    const connection = await SQLConnection.getConnection();
    await connection.getRepository(ProjectedAlbumCacheEntity)
      .createQueryBuilder()
      .update()
      .set({valid: false})
      .execute();
  }

  async deleteAll() {
    const connection = await SQLConnection.getConnection();
    await connection
      .getRepository(AlbumBaseEntity)
      .createQueryBuilder('album')
      .delete()
      .execute();
  }

  private async updateAlbums(session: SessionContext): Promise<void> {
    Logger.debug(LOG_TAG, 'Updating derived album data');
    const connection = await SQLConnection.getConnection();
    const albums = await connection
      .getRepository(SavedSearchEntity)
      .createQueryBuilder('album')
      .leftJoinAndSelect('album.cache', 'cache', 'cache.projectionKey = :pk AND cache.valid = 1', {pk: session.user.projectionKey})
      .getMany();

    for (const a of albums) {
      if (a.cache?.valid === true) {
        continue;
      }
      await ObjectManagers.getInstance().ProjectedCacheManager
        .setAndGetCacheForAlbum(connection, session, {
          id: a.id,
          searchQuery: a.searchQuery
        });
      // giving back the control to the main event loop (Macrotask queue)
      // https://blog.insiderattack.net/promises-next-ticks-and-immediates-nodejs-event-loop-part-3-9226cbe7a6aa
      await new Promise(setImmediate);
    }
  }

}
