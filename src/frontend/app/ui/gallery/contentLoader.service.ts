import {Injectable, OnDestroy} from '@angular/core';
import {NetworkService} from '../../model/network/network.service';
import {ContentWrapperUtils, ContentWrapperWithError, PackedContentWrapperWithError} from '../../../../common/entities/ContentWrapper';
import {SubDirectoryDTO,} from '../../../../common/entities/DirectoryDTO';
import {GalleryCacheService} from './cache.gallery.service';
import {BehaviorSubject, interval, Observable, Subject, Subscription} from 'rxjs';
import {Config} from '../../../../common/config/public/Config';
import {ShareService} from './share.service';
import {NavigationService} from '../../model/navigation.service';
import {QueryParams} from '../../../../common/QueryParams';
import {ErrorCodes} from '../../../../common/entities/Error';
import {map, skip, switchMap} from 'rxjs/operators';
import {MediaDTO} from '../../../../common/entities/MediaDTO';
import {FileDTO} from '../../../../common/entities/FileDTO';

@Injectable()
export class ContentLoaderService implements OnDestroy {
  public content: BehaviorSubject<ContentWrapperWithError>;
  public originalContent: Observable<DirectoryContent>;
  private ongoingContentRequest: string = null;
  private lastContentRequest: { type: 'directory' | 'search', value: string } = null;
  private pollingTimeSub: Subscription;
  private pollingTimerRestart = new Subject<void>();

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
    this.pollingTimeSub = this.pollingTimerRestart
      .pipe(
        // start a new interval each time pollingTimerRestart emits
        switchMap(() =>
          interval(1000 * Config.Gallery.AutoUpdate.interval).pipe(skip(1))
        )
      )
      .subscribe(() => {
        if (this.ongoingContentRequest !== null) {
          return;
        } // do not refresh if another request is ongoing
        //TODO: optimize this. no need to force reload directory if it's not changed' only dated search results
        this.reloadCurrentContent().catch(console.error);
      });

    this.pollingTimerRestart.next(); // start.
  }

  setContent(content: ContentWrapperWithError): void {
    if (ContentWrapperUtils.equals(this.content.value, content)) {
      return;
    }
    this.content.next(content);
  }

  public async loadDirectory(directoryName: string, forceReload = false): Promise<void> {

    // load from cache
    let cw = this.galleryCacheService.getDirectory(directoryName);

    this.setContent(ContentWrapperUtils.unpack(cw));
    this.ongoingContentRequest = directoryName;
    this.lastContentRequest = {type: 'directory', value: directoryName};

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
      cw = await this.networkService.getJson<PackedContentWrapperWithError>(
        '/gallery/content/' + encodeURIComponent(directoryName),
        params
      );
    } catch (e) {
      console.error(e);
    }
    if (this.ongoingContentRequest !== directoryName) {
      return;
    }
    this.ongoingContentRequest = null;
    this.pollingTimerRestart.next();

    if (!cw || cw.notModified === true) {
      return;
    }

    this.galleryCacheService.setDirectory(cw); // save it before adding references

    this.setContent(ContentWrapperUtils.unpack(cw));

  }

  public async search(query: string, forceReload = false): Promise<void> {

    this.ongoingContentRequest = query;
    this.lastContentRequest = {type: 'search', value: query};

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

    if (this.ongoingContentRequest !== query) {
      return;
    }
    this.ongoingContentRequest = null;
    this.pollingTimerRestart.next();

    this.setContent(ContentWrapperUtils.unpack(cw));
  }

  isSearchResult(): boolean {
    return !!this.content.value.searchResult;
  }

  public async reloadCurrentContent(): Promise<void> {
    if (!this.lastContentRequest) {
      return;
    }

    if (this.lastContentRequest.type === 'directory') {
      await this.loadDirectory(this.lastContentRequest.value, true);
    } else if (this.lastContentRequest.type === 'search') {
      await this.search(this.lastContentRequest.value, true);
    }
  }
}


export interface DirectoryContent {
  directories: SubDirectoryDTO[];
  media: MediaDTO[];
  metaFile: FileDTO[];
}
