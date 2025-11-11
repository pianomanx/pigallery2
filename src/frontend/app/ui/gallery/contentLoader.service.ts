import {Injectable, OnDestroy} from '@angular/core';
import {NetworkService} from '../../model/network/network.service';
import {ContentWrapperUtils, ContentWrapperWithError, PackedContentWrapperWithError} from '../../../../common/entities/ContentWrapper';
import {SubDirectoryDTO,} from '../../../../common/entities/DirectoryDTO';
import {GalleryCacheService} from './cache.gallery.service';
import {BehaviorSubject, interval, Observable, Subscription} from 'rxjs';
import {Config} from '../../../../common/config/public/Config';
import {ShareService} from './share.service';
import {NavigationService} from '../../model/navigation.service';
import {QueryParams} from '../../../../common/QueryParams';
import {ErrorCodes} from '../../../../common/entities/Error';
import {map, skip} from 'rxjs/operators';
import {MediaDTO} from '../../../../common/entities/MediaDTO';
import {FileDTO} from '../../../../common/entities/FileDTO';

@Injectable()
export class ContentLoaderService implements OnDestroy {
  public content: BehaviorSubject<ContentWrapperWithError>;
  public originalContent: Observable<DirectoryContent>;
  lastRequest: { directory: string } = {
    directory: null,
  };
  private searchId: number;
  private ongoingSearch: string = null;
  private currentContentRequest: { type: 'directory' | 'search', value: string } = null;
  private pollingTimeSub: Subscription;

  constructor(
    private networkService: NetworkService,
    private galleryCacheService: GalleryCacheService,
    private shareService: ShareService,
    private navigationService: NavigationService,
  ) {
    this.content = new BehaviorSubject<ContentWrapperWithError>(
      {} as ContentWrapperWithError
    );
    this.originalContent = this.content.pipe(
      map((c) => (c?.directory ? c?.directory : c?.searchResult))
    );
    this.setupAutoUpdate();
  }

  ngOnDestroy(): void {
    if (this.pollingTimeSub) {
      this.pollingTimeSub.unsubscribe();
      this.pollingTimeSub = null;
    }
  }

  setupAutoUpdate() {
    if (!Config.Gallery.AutoUpdate.enable) {
      return;
    }
    this.pollingTimeSub = interval(1000 * Config.Gallery.AutoUpdate.interval)
      .pipe(skip(1)) // do not refresh right away
      .subscribe(() => {
        this.reloadCurrentContent().catch(console.error);
      });
  }

  setContent(content: ContentWrapperWithError): void {
    if (ContentWrapperUtils.equals(this.content.value, content)) {
      return;
    }
    this.content.next(content);
  }

  public async loadDirectory(directoryName: string, forceReload = false): Promise<void> {

    // load from cache
    const cw = this.galleryCacheService.getDirectory(directoryName);

    this.setContent(ContentWrapperUtils.unpack(cw));
    this.lastRequest.directory = directoryName;
    this.currentContentRequest = {type: 'directory', value: directoryName};

    // prepare server request
    const params: { [key: string]: unknown } = {};
    if (Config.Sharing.enabled === true) {
      if (this.shareService.isSharing()) {
        params[QueryParams.gallery.sharingKey_query] =
          this.shareService.getSharingKey();
      }
    }

    if (
      !forceReload &&
      cw?.directory &&
      cw?.directory.lastModified &&
      cw?.directory.lastScanned &&
      !cw?.directory.isPartial
    ) {
      params[QueryParams.gallery.knownLastModified] =
        cw?.directory.lastModified;
      params[QueryParams.gallery.knownLastScanned] =
        cw?.directory.lastScanned;
    }

    try {
      const cw = await this.networkService.getJson<PackedContentWrapperWithError>(
        '/gallery/content/' + encodeURIComponent(directoryName),
        params
      );

      if (!cw || cw.notModified === true) {
        return;
      }

      this.galleryCacheService.setDirectory(cw); // save it before adding references

      if (this.lastRequest.directory !== directoryName) {
        return;
      }
      this.setContent(ContentWrapperUtils.unpack(cw));
    } catch (e) {
      console.error(e);
      this.navigationService.toGallery().catch(console.error);
    }
  }

  public async search(query: string, forceReload = false): Promise<void> {
    if (this.searchId != null) {
      clearTimeout(this.searchId);
    }

    this.ongoingSearch = query;
    this.currentContentRequest = {type: 'search', value: query};

    this.setContent({} as PackedContentWrapperWithError);
    let cw = this.galleryCacheService.getSearch(JSON.parse(query));
    if (forceReload || (!cw || cw.searchResult == null)) {
      try {
        cw = await this.networkService.getJson<PackedContentWrapperWithError>('/search/' + encodeURIComponent(query));
        this.galleryCacheService.setSearch(cw);
      } catch (e) {
        cw = cw || {
          directory: null,
          searchResult: null
        } as PackedContentWrapperWithError;
        if (e.code === ErrorCodes.LocationLookUp_ERROR) {
          cw.error = $localize`Cannot find location` + ': ' + e.message;
        } else {
          cw.error = $localize`Unknown server error` + ': ' + e.message;
        }
      }
    }

    if (this.ongoingSearch !== query) {
      return;
    }

    this.setContent(ContentWrapperUtils.unpack(cw));
  }

  isSearchResult(): boolean {
    return !!this.content.value.searchResult;
  }

  public async reloadCurrentContent(): Promise<void> {
    if (!this.currentContentRequest) {
      return;
    }

    if (this.currentContentRequest.type === 'directory') {
      await this.loadDirectory(this.currentContentRequest.value, true);
    } else if (this.currentContentRequest.type === 'search') {
      await this.search(this.currentContentRequest.value, true);
    }
  }
}


export interface DirectoryContent {
  directories: SubDirectoryDTO[];
  media: MediaDTO[];
  metaFile: FileDTO[];
}
