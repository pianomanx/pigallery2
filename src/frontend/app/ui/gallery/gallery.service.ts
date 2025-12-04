import {Injectable} from '@angular/core';
import {ActivatedRoute, Params, Router} from '@angular/router';
import {BehaviorSubject, Subscription} from 'rxjs';
import {Config} from '../../../../common/config/public/Config';
import {QueryParams} from '../../../../common/QueryParams';

@Injectable({
  providedIn: 'root'
})
export class GalleryService {
  public autoPollS = new BehaviorSubject(Config.Gallery.Lightbox.facesAlwaysOn);
  private subscription: Subscription;

  constructor(private route: ActivatedRoute,
              private router: Router) {


    this.subscription = this.route.queryParams.subscribe(
      (params: Params) => {
        const autoPoll = params[QueryParams.gallery.autoPoll];
        if (autoPoll !== undefined) {
          this.autoPoll = autoPoll === 'true' || autoPoll === true;
        }
      }
    );
  }

  get autoPoll(): boolean {
    return this.autoPollS.value;
  }

  set autoPoll(value: boolean) {
    if (this.autoPollS.value != value) {
      this.autoPollS.next(value);
      return;
    }
    this.updateQuery(QueryParams.gallery.autoPoll, Config.Gallery.AutoUpdate.enable, value);
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
