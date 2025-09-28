import {ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {ChangeDetectorRef, QueryList} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {AnimationBuilder} from '@angular/animations';
import {BehaviorSubject, of} from 'rxjs';

import {GalleryLightboxComponent, LightboxStates} from './lightbox.gallery.component';
import {GalleryPhotoComponent} from '../grid/photo/photo.grid.gallery.component';
import {FullScreenService} from '../fullscreen.service';
import {OverlayService} from '../overlay.service';
import {WakeLockService} from '../wakelock.service';
import {QueryService} from '../../../model/query.service';
import {PiTitleService} from '../../../model/pi-title.service';
import {LightboxService} from './lightbox.service';
import {PhotoDTO} from '../../../../../common/entities/PhotoDTO';
import {GridMedia} from '../grid/GridMedia';
import {QueryParams} from '../../../../../common/QueryParams';
import {AuthenticationService} from '../../../model/network/authentication.service';
import {GalleryCacheService} from '../cache.gallery.service';
import {FileSizePipe} from '../../../pipes/FileSizePipe';
import {DatePipe} from '@angular/common';

// Mock classes
class MockFullScreenService {
  isFullScreenEnabled() {
    return false;
  }

  exitFullScreen() {
  }

  showFullScreen() {
  }
}

class MockOverlayService {
  showOverlay() {
  }

  hideOverlay() {
  }
}

class MockWakeLockService {
  requestWakeLock() {
    return Promise.resolve();
  }

  releaseWakeLock() {
    return Promise.resolve();
  }
}

class MockQueryService {
  getMediaStringId(media: any) {
    return media.name;
  }

  getParams(params?: any) {
    return params || {};
  }
}


class MockAuthenticationService {
  canSearch() {
    return true;
  }
}

class MockGalleryCacheService {
  getSlideshowSpeed(){
    return 1000;
  }
}

class MockFileSizePipe {
}

class MockPiTitleService {
  setMediaTitle() {
  }

  setLastNonMedia() {
  }
}

class MockLightboxService {
  captionAlwaysOn = false;
  facesAlwaysOn = false;
  loopVideos = false;
  loopSlideshow = false;
}

class MockAnimationBuilder {
  build() {
    return {
      create() {
        return {
          play() {
          },
          onDone(callback: () => void) {
            setTimeout(callback, 0);
            return this;
          }
        };
      }
    };
  }
}

class MockRouter {
  navigate() {
    return Promise.resolve(true);
  }
}

class MockActivatedRoute {
  queryParams = new BehaviorSubject({});
}

// Mock photo components
function createMockPhotoComponent(media: PhotoDTO, index: number): GalleryPhotoComponent {
  const mockComponent = {
    gridMedia: new GridMedia(media, 1, 1, index),
    getDimension: () => ({top: 0, left: 0, width: 100, height: 100})
  } as GalleryPhotoComponent;
  return mockComponent;
}

function createMockPhoto(name: string, index: number): PhotoDTO {
  return {
    name: name,
    directory: {name: 'testdir', path: '/test'},
    metadata: {
      size: {width: 800, height: 600},
      caption: `Test photo ${index}`,
      creationDate: Date.now(),
      fileSize: 1024
    }
  } as PhotoDTO;
}

describe('GalleryLightboxComponent - Slideshow Tests', () => {
  let component: GalleryLightboxComponent;
  let fixture: ComponentFixture<GalleryLightboxComponent>;
  let mockLightboxService: MockLightboxService;
  let mockActivatedRoute: MockActivatedRoute;
  let mockRouter: MockRouter;
  let mockAuthenticationService: MockAuthenticationService;
  let mockGalleryCacheService: MockGalleryCacheService;
  let photoComponents: GalleryPhotoComponent[];

  beforeEach(async () => {
    mockLightboxService = new MockLightboxService();
    mockActivatedRoute = new MockActivatedRoute();
    mockRouter = new MockRouter();
    mockAuthenticationService = new MockAuthenticationService();
    mockGalleryCacheService = new MockGalleryCacheService();

    await TestBed.configureTestingModule({
      imports: [GalleryLightboxComponent],
      providers: [
        ChangeDetectorRef,
        {provide: FullScreenService, useClass: MockFullScreenService},
        {provide: OverlayService, useClass: MockOverlayService},
        {provide: WakeLockService, useClass: MockWakeLockService},
        {provide: AnimationBuilder, useClass: MockAnimationBuilder},
        {provide: Router, useValue: mockRouter},
        {provide: QueryService, useClass: MockQueryService},
        {provide: ActivatedRoute, useValue: mockActivatedRoute},
        {provide: PiTitleService, useClass: MockPiTitleService},
        {provide: LightboxService, useValue: mockLightboxService},
        {provide: AuthenticationService, useValue: mockAuthenticationService},
        {provide: GalleryCacheService, useValue: mockGalleryCacheService},
        {provide: FileSizePipe, useValue: MockFileSizePipe},
        {provide: DatePipe, useValue: MockFileSizePipe},


      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GalleryLightboxComponent);
    component = fixture.componentInstance;

    // Create mock photo components
    const photos = [
      createMockPhoto('photo1.jpg', 0),
      createMockPhoto('photo2.jpg', 1),
      createMockPhoto('photo3.jpg', 2)
    ];

    photoComponents = photos.map((photo, index) => createMockPhotoComponent(photo, index));

    // Create mock QueryList
    const mockQueryList = {
      length: photoComponents.length,
      toArray: () => photoComponents,
      get: (index: number) => photoComponents[index],
      find: (predicate: (item: GalleryPhotoComponent) => boolean) => photoComponents.find(predicate),
      changes: of([])
    } as any as QueryList<GalleryPhotoComponent>;

    component.setGridPhotoQL(mockQueryList);

    // Mock controls component
    component.controls = {
      resetZoom: jasmine.createSpy('resetZoom'),
      runSlideShow: jasmine.createSpy('runSlideShow'),
      stopSlideShow: jasmine.createSpy('stopSlideShow')
    } as any;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start slideshow when playback button is clicked', fakeAsync(() => {
    // Arrange
    spyOn(mockRouter, 'navigate').and.returnValue(Promise.resolve(true));
    component.status = LightboxStates.Open;
    component.onNavigateTo('photo1.jpg'); // Use public API

    // Act
    component.togglePlayback(true);
    tick();

    // Assert
    expect(component.slideShowRunning).toBe(true);
  }));

  it('should cycle through images during slideshow', fakeAsync(() => {
    // Arrange
    spyOn(mockRouter, 'navigate').and.returnValue(Promise.resolve(true));
    component.status = LightboxStates.Open;
    component.onNavigateTo('photo1.jpg'); // Use public API
    component.slideShowRunning = true;

    // Act - simulate next image calls during slideshow
    component.nextImage();
    tick();

    // Assert
    expect(mockRouter.navigate).toHaveBeenCalled();
  }));

  it('should stop slideshow at last image when loopSlideshow is disabled', fakeAsync(() => {
    // Arrange
    mockLightboxService.loopSlideshow = false;
    spyOn(mockRouter, 'navigate').and.returnValue(Promise.resolve(true));
    component.status = LightboxStates.Open;
    component.onNavigateTo('photo3.jpg'); // Navigate to last photo using public API
    component.slideShowRunning = true;

    // Act - try to go to next image from last photo
    component.nextImage();
    tick();

    // Assert - should wrap to first photo but slideshow should stop in real scenario
    // The nextImage method always wraps, but slideshow logic in controls should stop
    expect(component.NexGridMedia).toBeNull(); // No next media when not looping
  }));

  it('should continue slideshow from first image when loopSlideshow is enabled', fakeAsync(() => {
    // Arrange
    mockLightboxService.loopSlideshow = true;
    spyOn(mockRouter, 'navigate').and.returnValue(Promise.resolve(true));
    component.status = LightboxStates.Open;
    component.onNavigateTo('photo3.jpg'); // Navigate to last photo using public API
    component.slideShowRunning = true;

    // Act - try to go to next image from last photo
    component.nextImage();
    tick();

    // Assert - should wrap to first photo and continue slideshow
    expect(component.NexGridMedia).toBe(photoComponents[0].gridMedia); // Should return first media when looping
    expect(mockRouter.navigate).toHaveBeenCalled();
  }));

  it('should stop slideshow when pause button is clicked', fakeAsync(() => {
    // Arrange
    component.slideShowRunning = true;
    component.onNavigateTo('photo1.jpg');

    // Act
    component.togglePlayback(false);
    tick();

    // Assert
    expect(component.slideShowRunning).toBe(false);
  }));

  it('should handle slideshow with route params', fakeAsync(() => {
    // Arrange - spy on public property instead
    const initialSlideShowState = component.slideShowRunning;

    // Act - simulate playback param in route
    mockActivatedRoute.queryParams.next({[QueryParams.gallery.playback]: 'true'});
    tick();

    // Assert
    expect(component.slideShowRunning).toBe(true);

    // Act - simulate removing playback param
    mockActivatedRoute.queryParams.next({});
    tick();

    // Assert
    expect(component.slideShowRunning).toBe(false);
  }));

  it('should navigate to specific photo and start slideshow', fakeAsync(() => {
    // Arrange
    spyOn(mockRouter, 'navigate').and.returnValue(Promise.resolve(true));
    component.status = LightboxStates.Open;

    // Act
    mockActivatedRoute.queryParams.next({
      [QueryParams.gallery.photo]: 'photo2.jpg',
      [QueryParams.gallery.playback]: 'true'
    });
    tick();

    // Assert
    expect(component.slideShowRunning).toBe(true);
  }));

  it('should not advance to next photo when no more photos and loopSlideshow disabled', () => {
    // Arrange
    mockLightboxService.loopSlideshow = false;
    component.status = LightboxStates.Open;
    component.onNavigateTo('photo3.jpg'); // Navigate to last photo using public API

    // Act & Assert
    expect(component.navigation.hasNext).toBe(false);
    expect(component.NexGridMedia).toBeNull();
  });

  it('should advance to first photo when at last photo and loopSlideshow enabled', () => {
    // Arrange
    mockLightboxService.loopSlideshow = true;
    component.status = LightboxStates.Open;
    component.onNavigateTo('photo3.jpg'); // Navigate to last photo using public API

    // Act & Assert
    expect(component.NexGridMedia).toBe(photoComponents[0].gridMedia);
  });
});
