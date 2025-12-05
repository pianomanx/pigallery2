export const QueryParams = {
  gallery: {
    random: {
      directory: 'dir',
      recursive: 'recursive',
      orientation: 'orientation',
      fromDate: 'fromDate',
      toDate: 'toDate',
      minResolution: 'fromRes',
      maxResolution: 'toRes',
    },
    search: {
      type: 'type',
      query: 'qs',
    },
    photo: 'p',
    sharingKey_query: 'sk',
    sharingKey_params: 'sharingKey',
    directory: 'directory',
    knownLastModified: 'klm',
    knownLastScanned: 'kls',
    fullscreen: 'fullscreen',
    lightbox: {
      playback: 'play',
      captionAlwaysOn: 'captionAlwaysOn',
      facesAlwaysOn: 'facesAlwaysOn',
      loopVideos: 'loopVideos',
      loopSlideshow: 'loopSlideshow',
      slideshowSpeed: 'slideshowSpeed' // in seconds
    },
    autoPoll: 'autoUpdate',
  },
};
