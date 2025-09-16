import {Component, OnDestroy, OnInit} from '@angular/core';
import {MediaButtonModalData, MediaButtonModalService} from './media-button-modal.service';
import {Subscription} from 'rxjs';
import {NgFor, NgIf} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {IClientMediaFields} from '../../../../../../../common/entities/extension/IClientUIConfig';
@Component({
  selector: 'app-media-button-modal',
  templateUrl: './media-button-modal.component.html',
  styleUrls: ['./media-button-modal.component.css'],
  imports: [NgIf, NgFor, FormsModule],
  standalone: true
})
export class MediaButtonModalComponent implements OnInit, OnDestroy {
  modalData: MediaButtonModalData | null = null;
  formData: { [key: string]: any } = {};
  private subscription: Subscription;

  constructor(private modalService: MediaButtonModalService) {
  }

  ngOnInit(): void {
    this.subscription = this.modalService.modalData.subscribe(data => {
      this.modalData = data;
      if (data) {
        this.initFormData();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private initFormData(): void {
    this.formData = {};
    if (this.modalData?.button.popup?.fields) {
      this.modalData.button.popup.fields.forEach(field => {
        this.formData[field] = this.getFieldValue(field);
      });
    }
  }

  getFieldLabel(field: IClientMediaFields): string {
    const labels: { [key in IClientMediaFields]: string } = {
      title: $localize`Title`,
      caption: $localize`Caption`,
      cameraData: $localize`Camera Data`,
      positionData: $localize`Position Data`,
      faces: $localize`Faces`,
      size: $localize`Size`,
      creationDate: $localize`Creation Date`,
      creationDateOffset: $localize`Creation Date Offset`,
      bitRate: $localize`Bit Rate`,
      duration: $localize`Duration`,
      fileSize: $localize`File Size`,
      fps: $localize`FPS`
    };
    return labels[field] || field;
  }

  getFieldValue(field: IClientMediaFields): any {
    if (!this.modalData) {
      return '';
    }

    const media = this.modalData.media;
    const metadata = media.media.metadata;

    switch (field) {
      case 'title':
      case 'caption':
        return (metadata as any)[field] || '';
      case 'cameraData':
        return JSON.stringify((metadata as any).cameraData || {});
      case 'positionData':
        return JSON.stringify((metadata as any).positionData || {});
      case 'faces':
        return JSON.stringify((metadata as any).faces || []);
      case 'size':
        return JSON.stringify((metadata as any).size || {});
      case 'creationDate':
        return (metadata as any).creationDate || '';
      case 'creationDateOffset':
        return (metadata as any).creationDateOffset || '';
      case 'bitRate':
        return (metadata as any).bitRate || '';
      case 'duration':
        return (metadata as any).duration || '';
      case 'fileSize':
        return (metadata as any).fileSize || '';
      case 'fps':
        return (metadata as any).fps || '';
      default:
        return '';
    }
  }

  closeModal(): void {
    this.modalService.hideModal();
  }

  executeAction(): void {
    if (this.modalData) {
      this.modalService.executeButtonAction(
        this.modalData.button,
        this.modalData.media,
        this.formData
      );
    }
  }
}
