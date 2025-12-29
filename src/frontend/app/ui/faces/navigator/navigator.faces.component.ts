import {Component} from '@angular/core';
import {FacesService} from '../faces.service';
import {SortByDirectionalTypes} from '../../../../../common/entities/SortingMethods';
import {Utils} from '../../../../../common/Utils';
import {Config} from '../../../../../common/config/public/Config';
import { NgIf, NgFor, AsyncPipe } from '@angular/common';
import { NgIconComponent } from '@ng-icons/core';
import { SortingMethodIconComponent } from '../../utils/sorting-method-icon/sorting-method-icon.component';
import { BsDropdownDirective, BsDropdownToggleDirective, BsDropdownMenuDirective } from 'ngx-bootstrap/dropdown';
import { StringifySortingMethod } from '../../../pipes/StringifySortingMethod';

@Component({
  selector: 'app-faces-navbar',
  styleUrls: ['./navigator.faces.component.css'],
  templateUrl: './navigator.faces.component.html',
  imports: [
    NgIf,
    NgFor,
    NgIconComponent,
    BsDropdownDirective,
    BsDropdownToggleDirective,
    SortingMethodIconComponent,
    BsDropdownMenuDirective,
    AsyncPipe,
    StringifySortingMethod,
  ]
})
export class FacesNavigatorComponent {
  public readonly sortingByTypes: { key: number; value: string }[] = [];
  public readonly config = Config;

  constructor(
    public facesService: FacesService,
  ) {
    this.sortingByTypes = [
      {key: SortByDirectionalTypes.Name, value: SortByDirectionalTypes[SortByDirectionalTypes.Name]},
      {key: SortByDirectionalTypes.PersonCount, value: SortByDirectionalTypes[SortByDirectionalTypes.PersonCount]}
    ];
  }

  isDefaultSorting(): boolean {
    return this.facesService.sorting.value.method === SortByDirectionalTypes.Name &&
      this.facesService.sorting.value.ascending === true;
  }

  setSortingBy(sorting: number): void {
    this.facesService.setSorting({
      method: sorting,
      ascending: this.facesService.sorting.value.ascending
    });
  }

  setSortingAscending(asc: boolean) {
    this.facesService.setSorting({
      method: this.facesService.sorting.value.method,
      ascending: asc
    });
  }
}
