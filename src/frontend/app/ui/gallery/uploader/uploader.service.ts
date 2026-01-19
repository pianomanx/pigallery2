import {Injectable} from '@angular/core';
import {HttpClient, HttpEventType} from '@angular/common/http';
import {NetworkService} from '../../../model/network/network.service';
import {SupportedFormats} from '../../../../../common/SupportedFormats';
import {Utils} from '../../../../../common/Utils';
import {ContentLoaderService} from '../contentLoader.service';
import {Config} from '../../../../../common/config/public/Config';
import {AuthenticationService} from '../../../model/network/authentication.service';
import {UserRoles} from '../../../../../common/entities/UserDTO';
import {NotificationService} from '../../../model/notification.service';

export interface UploadProgress {
  name: string;
  progress: number;
  error?: string;
  done: boolean;
  lastUpdate: number;
  count?: number; // Added for consolidated items
}

@Injectable({
  providedIn: 'root'
})
export class UploaderService {
  public uploadProgress: UploadProgress[] = [];

  constructor(private http: HttpClient,
              private networkService: NetworkService,
              private notificationService: NotificationService,
              private authService: AuthenticationService,
              private contentLoaderService: ContentLoaderService) {
  }

  public canUpload(): boolean {
    return Config.Users.authenticationRequired &&
      this.authService.isAuthenticated() &&
      this.authService.user.value.role >= UserRoles.Admin &&
      !!this.contentLoaderService.content.value.directory;
  }

  public uploadFiles(files: FileList | File[]): void {
    const f = [];
    for (let i = 0; i < files.length; i++) {
      f.push(files[i]);
    }
    const dir = this.contentLoaderService.content.value.directory;
    this._uploadFiles(f, Utils.concatUrls(dir.path, dir.name));
  }

  private async _uploadFiles(files: File[], directory: string): Promise<void> {
    const supportedFiles = files.filter(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      return SupportedFormats.Photos.includes(ext) ||
        SupportedFormats.Videos.includes(ext) ||
        SupportedFormats.MetaFiles.includes(ext);
    });

    if (supportedFiles.length < files.length) {
      this.notificationService.warning($localize`Some files were skipped due to unsupported format.`);
    }

    if (supportedFiles.length === 0) {
      return;
    }

    // Track each file individually in the progress list
    const progressItems: UploadProgress[] = [];
    const existingFiles: File[] = [];
    const supportedFilesToUpload: File[] = [];

    for (const f of supportedFiles) {
      // Check if file already exists in the current directory
      const dir = this.contentLoaderService.content.value.directory;
      let fileExists = false;
      if (dir) {
        fileExists = (dir.media && dir.media.some(m => m.name === f.name)) ||
          (dir.metaFile && dir.metaFile.some(m => m.name === f.name));
      }

      if (fileExists) {
        existingFiles.push(f);
      } else {
        supportedFilesToUpload.push(f);
        progressItems.push({
          name: f.name,
          progress: 0,
          done: false,
          lastUpdate: Date.now()
        });
      }
    }

    if (existingFiles.length > 0) {
      const existingItem: UploadProgress = {
        name: existingFiles.length === 1 ? existingFiles[0].name : $localize`${existingFiles.length} files already exist`,
        progress: 100,
        done: true,
        lastUpdate: Date.now(),
        error: $localize`File already exists`,
        count: existingFiles.length
      };
      this.uploadProgress.push(existingItem);
      this._cleanupProgress([existingItem]);
    }

    if (supportedFilesToUpload.length === 0) {
      return;
    }

    this.uploadProgress.push(...progressItems);

    const formData = new FormData();
    supportedFilesToUpload.forEach(f => formData.append('files', f));

    const url = Utils.concatUrls(this.networkService.apiBaseUrl, '/upload/', directory || '');

    this.http.post(url, formData, {
      reportProgress: true,
      observe: 'events'
    }).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          const progress = Math.round((100 * event.loaded) / event.total);
          progressItems.forEach(item => {
            if (!item.done) {
              item.progress = progress;
              item.lastUpdate = Date.now();
            }
          });
        } else if (event.type === HttpEventType.Response) {
          const response = event.body as any;
          const serverErrors = (response && response.result) ? response.result : [];

          progressItems.forEach(item => {
            if (item.done) {
              return;
            }
            const serverError = serverErrors.find((e: any) => e.filename === item.name);
            if (serverError) {
              item.error = serverError.error;
            } else {
              item.progress = 100;
              item.lastUpdate = Date.now();
            }
            item.done = true;
          });

          if (serverErrors.length > 0) {
            this.notificationService.warning($localize`Upload completed with some errors.`);
          } else {
            this.notificationService.success($localize`Upload completed: ` + supportedFilesToUpload.length + $localize` files.`);
          }

          this.contentLoaderService.reloadCurrentContent().catch(console.error);
          this._cleanupProgress(progressItems);
        }
      },
      error: (err) => {
        progressItems.forEach(item => {
          if (!item.done) {
            item.error = err.message || err;
            item.done = true;
            item.lastUpdate = Date.now();
          }
        });
        this.notificationService.error($localize`Upload failed: ` + (err.message || err));
        this._cleanupProgress(progressItems);
      }
    });
  }

  private _cleanupProgress(items: UploadProgress[]): void {
    // Remove from list after some time
    items.forEach(item => {
      setTimeout(() => {
        const idx = this.uploadProgress.indexOf(item);
        if (idx !== -1) {
          this.uploadProgress.splice(idx, 1);
        }
      }, 5000);
    });
  }
}
