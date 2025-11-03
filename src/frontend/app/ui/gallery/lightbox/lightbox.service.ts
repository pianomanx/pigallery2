import {Injectable} from '@angular/core';
import {Config} from '../../../../../common/config/public/Config';
import {ActivatedRoute, Params, Router} from '@angular/router';
import {QueryParams} from '../../../../../common/QueryParams';
import {Subscription} from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LightboxService {
  private subscription: Subscription;

  constructor(private route: ActivatedRoute,
              private router: Router) {


    this.subscription = this.route.queryParams.subscribe(
      (params: Params) => {
        const sValue = params[QueryParams.gallery.lightbox.slideshowSpeed];
        if (sValue !== undefined) {
          this.slideshowSpeed = parseInt(sValue, 10) as number;
        }
        const faoValue = params[QueryParams.gallery.lightbox.facesAlwaysOn];
        if (faoValue !== undefined) {
          this.facesAlwaysOn = faoValue === 'true' || faoValue === true;
        }
        const lvValue = params[QueryParams.gallery.lightbox.loopVideos];
        if (lvValue !== undefined) {
          this.loopVideos = lvValue === 'true' || lvValue === true;
        }
        const lsValue = params[QueryParams.gallery.lightbox.loopSlideshow];
        if (lsValue !== undefined) {
          this.loopSlideshow = lsValue === 'true' || lsValue === true;
        }
        const qpValue = params[QueryParams.gallery.lightbox.captionAlwaysOn];
        if (qpValue !== undefined) {
          this.captionAlwaysOn = qpValue === 'true' || qpValue === true;
        }
        const pbValue = params[QueryParams.gallery.lightbox.playback];
        if (pbValue !== undefined) {
          this.playback = pbValue === 'true' || pbValue === true;
        }
      }
    );
  }

  private _slideshowSpeed: number = Config.Gallery.Lightbox.slideshowSpeed;

  get slideshowSpeed(): number {
    return this._slideshowSpeed;
  }

  set slideshowSpeed(value: number) {
    this._slideshowSpeed = parseInt(value as unknown as any) as number;
    this.updateQuery(QueryParams.gallery.lightbox.slideshowSpeed, Config.Gallery.Lightbox.slideshowSpeed, value);
  }

  private _playback = false;

  get playback(): boolean {
    return this._playback;
  }

  set playback(value: boolean) {
    this._playback = value;
    this.updateQuery(QueryParams.gallery.lightbox.playback, false, value);
  }

  private _facesAlwaysOn = Config.Gallery.Lightbox.facesAlwaysOn;

  get facesAlwaysOn(): boolean {
    return this._facesAlwaysOn;
  }

  set facesAlwaysOn(value: boolean) {
    this._facesAlwaysOn = value;
    this.updateQuery(QueryParams.gallery.lightbox.facesAlwaysOn, Config.Gallery.Lightbox.facesAlwaysOn, value);
  }

  private _loopVideos = Config.Gallery.Lightbox.loopVideos;

  get loopVideos(): boolean {
    return this._loopVideos;
  }

  set loopVideos(value: boolean) {
    this._loopVideos = value;
    this.updateQuery(QueryParams.gallery.lightbox.loopVideos, Config.Gallery.Lightbox.loopVideos, value);
  }

  private _loopSlideshow = Config.Gallery.Lightbox.loopSlideshow;

  get loopSlideshow(): boolean {
    return this._loopSlideshow;
  }

  set loopSlideshow(value: boolean) {
    this._loopSlideshow = value;
    this.updateQuery(QueryParams.gallery.lightbox.loopSlideshow, Config.Gallery.Lightbox.loopSlideshow, value);
  }

  private _captionAlwaysOn = Config.Gallery.Lightbox.captionAlwaysOn;

  get captionAlwaysOn(): boolean {
    return this._captionAlwaysOn;
  }

  set captionAlwaysOn(value: boolean) {
    this._captionAlwaysOn = value;
    this.updateQuery(QueryParams.gallery.lightbox.captionAlwaysOn, Config.Gallery.Lightbox.captionAlwaysOn, value);
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  private updateQuery(key: string, defValue: boolean | number, newValue: boolean | number) {
    if (defValue === newValue) {
      newValue = null;
    }
    // Merge this param into the current URL
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        [key]: newValue
      },
      queryParamsHandling: 'merge', // keep existing params
      replaceUrl: true // optional: avoid pushing to the history stack
    }).catch(console.error);
  }
}
