import {Component, HostListener, Input} from '@angular/core';
import {NgFor, NgIf, NgStyle} from '@angular/common';
import {NgIconComponent} from '@ng-icons/core';
import {UploaderService} from '../uploader.service';

@Component({
  selector: 'app-gallery-uploader',
  templateUrl: './upload-progress.gallery.component.html',
  styleUrls: ['./upload-progress.gallery.component.css'],
  imports: [
    NgIf,
    NgFor,
    NgIconComponent,
    NgStyle,
  ]
})
export class UploaderComponent {
  public readonly Date = Date;
  @Input() isUploadOver: boolean;
  public showDetails = false;

  constructor(public uploaderService: UploaderService) {
  }

  toggleDetails(): void {
    this.showDetails = !this.showDetails;
  }

  getOverallProgress(): number {
    if (this.uploaderService.uploadProgress.length === 0) {
      return 0;
    }
    const sum = this.uploaderService.uploadProgress.reduce((a, b) => a + b.progress, 0);
    return Math.round(sum / this.uploaderService.uploadProgress.length);
  }

}

