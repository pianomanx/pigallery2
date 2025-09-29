import {expect} from 'chai';
import {ContentWrapper} from '../../../src/common/entities/ContentWrapper';
import {TestHelper} from '../../TestHelper';
import {DirectoryPathDTO, ParentDirectoryDTO} from '../../../src/common/entities/DirectoryDTO';
import {SearchResultDTO} from '../../../src/common/entities/SearchResultDTO';
import {SearchQueryTypes, TextSearch} from '../../../src/common/entities/SearchQueryDTO';
import {Utils} from '../../../src/common/Utils';
import {MediaDTOUtils} from '../../../src/common/entities/MediaDTO';
import {VideoDTO} from '../../../src/common/entities/VideoDTO';
import {PhotoDTO} from '../../../src/common/entities/PhotoDTO';


describe('ContentWrapper', () => {

  const cleanUpCW = (cw: ContentWrapper): ContentWrapper => {
    if (typeof cw.notModified === 'undefined') {
      delete cw.notModified;
    }

    const content = (cw?.directory ? cw.directory : cw?.searchResult);
    for (let i = 0; i < content.media.length; ++i) {
      const m = content.media[i];
      if (MediaDTOUtils.isPhoto(m)) {
        delete (m as VideoDTO).metadata.bitRate;
        delete (m as VideoDTO).metadata.duration;
        if (!(m as PhotoDTO).metadata.caption) {
          delete (m as PhotoDTO).metadata.caption;
        }
      } else if (MediaDTOUtils.isVideo(m)) {
        delete (m as PhotoDTO).metadata.rating;
        delete (m as PhotoDTO).metadata.caption;
        delete (m as PhotoDTO).metadata.cameraData;
        delete (m as PhotoDTO).metadata.keywords;
        delete (m as PhotoDTO).metadata.faces;
        delete (m as PhotoDTO).metadata.positionData;
      }
      if (m.missingThumbnails === 0) {
        delete m.missingThumbnails;
      }
    }
    if(!(content.directories?.length >0)){
      delete content.directories;
    }
    for (let i = 0; i < content.metaFile.length; ++i) {
      delete content.metaFile[i].id;
    }
    return cw;
  };

  it('pack and unpack directory', () => {
    const parent = TestHelper.getDirectoryEntry();
    TestHelper.getPhotoEntry(parent);
    TestHelper.getPhotoEntry1(parent);
    TestHelper.getPhotoEntry2(parent);
    TestHelper.getVideoEntry(parent);
    TestHelper.getGPXEntry(parent);
    const parentOrig = TestHelper.getDirectoryEntry();
    TestHelper.getPhotoEntry(parentOrig);
    TestHelper.getPhotoEntry1(parentOrig);
    TestHelper.getPhotoEntry2(parentOrig);
    TestHelper.getVideoEntry(parentOrig);
    TestHelper.getGPXEntry(parentOrig);
    const cwOrig = new ContentWrapper(parentOrig as ParentDirectoryDTO, null);
    const cw = new ContentWrapper(parent as ParentDirectoryDTO, null);
    expect(ContentWrapper.unpack(ContentWrapper.pack(cw))).to.deep.equals(cleanUpCW(cwOrig));
  });
  it('pack and unpack search result', () => {

    const parent: DirectoryPathDTO = {
      name: 'parent',
      path: ''
    };

    const subDir: DirectoryPathDTO = {
      name: 'subDir',
      path: 'parent/'
    };

    const sr: SearchResultDTO = {
      directories: [subDir as any],
      media: [TestHelper.getPhotoEntry(parent),
        TestHelper.getPhotoEntry1(parent),
        TestHelper.getPhotoEntry2(subDir),
        TestHelper.getVideoEntry(parent)
      ],
      metaFile: [
        TestHelper.getGPXEntry(parent)],
      resultOverflow: false,
      searchQuery: {type: SearchQueryTypes.any_text, text: ''} as TextSearch
    };

    const cw = new ContentWrapper(null, sr);
    expect(ContentWrapper.unpack(ContentWrapper.pack(Utils.clone(cw)))).to.deep.equals(cleanUpCW(cw));
  });
});
