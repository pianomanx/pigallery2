import {Injectable} from '@angular/core';
import {Config} from '../../../../../common/config/public/Config';

@Injectable({
  providedIn: 'root'
})
export class LightboxService {
  public captionAlwaysOn = Config.Gallery.Lightbox.captionAlwaysOn;
  public facesAlwaysOn = Config.Gallery.Lightbox.facesAlwaysOn;
  public loopVideos = Config.Gallery.Lightbox.loopVideos;
  public loopSlideshow = Config.Gallery.Lightbox.loopSlideshow;
}
