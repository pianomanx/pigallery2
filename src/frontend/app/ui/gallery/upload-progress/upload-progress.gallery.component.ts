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

  constructor(public uploaderService: UploaderService) {
  }

}

