import {Component, EventEmitter, Input, Output,OnChanges} from '@angular/core';
import {BlogService, GroupedMarkdown} from './blog.service';
import {map, Observable} from 'rxjs';
import { NgIf, NgFor, AsyncPipe } from '@angular/common';
import { MarkdownComponent } from 'ngx-markdown';
import { NgIconComponent } from '@ng-icons/core';
import { FileDTOToRelativePathPipe } from '../../../pipes/FileDTOToRelativePathPipe';

@Component({
    selector: 'app-gallery-blog',
    templateUrl: './blog.gallery.component.html',
    styleUrls: ['./blog.gallery.component.css'],
    imports: [
        NgIf,
        NgFor,
        MarkdownComponent,
        NgIconComponent,
        AsyncPipe,
        FileDTOToRelativePathPipe,
    ]
})
export class GalleryBlogComponent implements OnChanges {
  @Input() open: boolean;
  /**
   * Blog is inserted to the top (when date is null) and to all date groups, when date is set
   */
  @Input() date: Date;
  @Output() openChange = new EventEmitter<boolean>();
  mkObservable: Observable<GroupedMarkdown[]>;

  constructor(public blogService: BlogService) {
  }


  ngOnChanges(): void {
    const utcDate = this.date ? this.date.getTime() : undefined;
    this.mkObservable = this.blogService.groupedMarkdowns.pipe(map(gm => {
      if (!this.date) {
        return gm.filter(g => !g.date);
      }
      return gm.filter(g => g.date == utcDate);
    }));
  }


  toggleCollapsed(): void {
    this.open = !this.open;
    this.openChange.emit(this.open);
  }
}

