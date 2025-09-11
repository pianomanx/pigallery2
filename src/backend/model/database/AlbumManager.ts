import {SQLConnection} from './SQLConnection';
import {AlbumBaseEntity} from './enitites/album/AlbumBaseEntity';
import {AlbumBaseDTO} from '../../../common/entities/album/AlbumBaseDTO';
import {ObjectManagers} from '../ObjectManagers';
import {SearchQueryDTO} from '../../../common/entities/SearchQueryDTO';
import {SavedSearchEntity} from './enitites/album/SavedSearchEntity';
import {Logger} from '../../Logger';
import {IObjectManager} from './IObjectManager';
import {SessionContext} from '../SessionContext';

const LOG_TAG = '[AlbumManager]';

export class AlbumManager implements IObjectManager {
  /**
   * Person table contains denormalized data that needs to update when isDBValid = false
   */
  private isDBValid = false;

  private static async updateAlbum(session: SessionContext, album: SavedSearchEntity): Promise<void> {
    const connection = await SQLConnection.getConnection();

    await ObjectManagers.getInstance().ProjectedCacheManager
      .setAndGetCacheForAlbum(connection, session, {
        id: album.id,
        searchQuery: album.searchQuery
      });

  }

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
    const a = await connection
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

  public async getAlbums(session: SessionContext): Promise<AlbumBaseDTO[]> {
    await this.updateAlbums(session);
    const connection = await SQLConnection.getConnection();

    // Return albums with projected cache data
    return await connection
      .getRepository(AlbumBaseEntity)
      .createQueryBuilder('album')
      .leftJoin('album.cache', 'cache', 'cache.projectionKey = :pk AND cache.valid = 1', {pk: session.user.projectionKey})
      .leftJoin('cache.cover', 'cover')
      .leftJoin('cover.directory', 'directory')
      .select(['album', 'cache', 'cover.name', 'directory.name', 'directory.path'])
      .getMany();

  }

  public async onNewDataVersion(): Promise<void> {
    await this.resetCovers();
  }

  public async resetCovers(): Promise<void> {
    this.isDBValid = false;
  }

  private async updateAlbums(session: SessionContext): Promise<void> {
    if (this.isDBValid === true) {
      return;
    }
    Logger.debug(LOG_TAG, 'Updating derived album data');
    const connection = await SQLConnection.getConnection();
    const albums = await connection.getRepository(AlbumBaseEntity).find();

    for (const a of albums) {
      await AlbumManager.updateAlbum(session, a as SavedSearchEntity);
      // giving back the control to the main event loop (Macrotask queue)
      // https://blog.insiderattack.net/promises-next-ticks-and-immediates-nodejs-event-loop-part-3-9226cbe7a6aa
      await new Promise(setImmediate);
    }
    this.isDBValid = true;
  }

  async deleteAll() {
    const connection = await SQLConnection.getConnection();
    await connection
      .getRepository(AlbumBaseEntity)
      .createQueryBuilder('album')
      .delete()
      .execute();
  }
}
