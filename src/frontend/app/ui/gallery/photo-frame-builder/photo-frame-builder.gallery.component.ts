import {Component, OnDestroy, OnInit, TemplateRef} from '@angular/core';
import {ContentWrapper} from '../../../../../common/entities/ContentWrapper';
import {NotificationService} from '../../../model/notification.service';
import {BsModalService} from 'ngx-bootstrap/modal';
import {BsModalRef} from 'ngx-bootstrap/modal/bs-modal-ref.service';
import {Subscription} from 'rxjs';
import {ActivatedRoute, Router} from '@angular/router';
import {QueryParams} from '../../../../../common/QueryParams';
import {ContentLoaderService} from '../contentLoader.service';
import { NgIconComponent } from '@ng-icons/core';
import { FormsModule } from '@angular/forms';
import { ClipboardModule } from 'ngx-clipboard';

@Component({
    selector: 'app-gallery-photo-frame-builder',
    templateUrl: './photo-frame-builder.gallery.component.html',
    styleUrls: ['./photo-frame-builder.gallery.component.css'],
    imports: [
        NgIconComponent,
        FormsModule,
        ClipboardModule,
    ]
})
export class PhotoFrameBuilderGalleryComponent implements OnInit, OnDestroy {
  enabled = true;
  url = '';
  // Options
  autoPollInterval = 5 * 60; // 5m
  loopSlideshow = true;
  captionAlwaysOn = true;
  slideshowSpeed = 5 * 60; // 5m

  contentSubscription: Subscription = null;

  modalRef: BsModalRef;

  private readonly subscription: Subscription = null;

  constructor(
      public contentLoaderService: ContentLoaderService,
      private notification: NotificationService,
      private route: ActivatedRoute,
      private router: Router,
      private modalService: BsModalService
  ) {
    // keep for potential future route driven defaults
    this.subscription = this.route.queryParams.subscribe(() => {
      // no-op, we only need router.url at open/build time
    });
  }

  private buildUrl(): void {
    // Build from current router URL, merging our params without affecting actual navigation
    const base = window.location.origin;
    const currentUrl = this.router.url; // includes path + query
    const u = new URL(base + currentUrl);

    // Always autoplay for photo frame
    u.searchParams.set(QueryParams.gallery.lightbox.playback, 'true');

    // Auto polling toggle
    if (typeof this.autoPollInterval != 'undefined') {
      u.searchParams.set(QueryParams.gallery.autoPollInterval,
        String(parseInt(this.autoPollInterval as unknown as any, 10)));
    } else {
      u.searchParams.delete(QueryParams.gallery.autoPollInterval);
    }

    // Loop slideshow toggle
    if (this.loopSlideshow) {
      u.searchParams.set(QueryParams.gallery.lightbox.loopSlideshow, 'true');
    } else {
      u.searchParams.delete(QueryParams.gallery.lightbox.loopSlideshow);
    }

    // Captions always on
    if (this.captionAlwaysOn) {
      u.searchParams.set(QueryParams.gallery.lightbox.captionAlwaysOn, 'true');
    } else {
      u.searchParams.delete(QueryParams.gallery.lightbox.captionAlwaysOn);
    }

    // Slideshow speed (in seconds)
    if (this.slideshowSpeed && this.slideshowSpeed > 0) {
      u.searchParams.set(
        QueryParams.gallery.lightbox.slideshowSpeed,
        String(parseInt(this.slideshowSpeed as unknown as any, 10))
      );
    } else {
      u.searchParams.delete(QueryParams.gallery.lightbox.slideshowSpeed);
    }

    this.url = u.href;
  }

  onOptionsChange(): void {
    this.buildUrl();
  }

  ngOnInit(): void {
    this.contentSubscription = this.contentLoaderService.content.subscribe(
        (content: ContentWrapper) => {
          this.enabled = !!(content?.directory || content?.searchResult);
          if (!this.enabled) {
            return;
          }
          // this.data.directory = Utils.concatUrls((<DirectoryDTO>content.directory).path, (<DirectoryDTO>content.directory).name);
        }
    );
  }

  ngOnDestroy(): void {
    if (this.contentSubscription !== null) {
      this.contentSubscription.unsubscribe();
    }

    if (this.subscription !== null) {
      this.subscription.unsubscribe();
    }
  }

  openModal(template: TemplateRef<unknown>): boolean {
    if (!this.enabled) {
      return;
    }
    if (this.modalRef) {
      this.modalRef.hide();
    }

    this.modalRef = this.modalService.show(template, {class: 'modal-lg'});
    document.body.style.paddingRight = '0px';
    this.buildUrl();
    return false;
  }

  onCopy(): void {
    this.notification.success($localize`Url has been copied to clipboard`);
  }

  public hideModal(): void {
    this.modalRef.hide();
    this.modalRef = null;
  }
}
