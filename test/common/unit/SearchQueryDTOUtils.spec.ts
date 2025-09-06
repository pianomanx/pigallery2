import {expect} from 'chai';
import {
  ANDSearchQuery,
  ORSearchQuery,
  SearchQueryDTO,
  SearchQueryTypes,
  SomeOfSearchQuery,
  TextSearch,
  TextSearchQueryMatchTypes,
} from '../../../src/common/entities/SearchQueryDTO';
import { SearchQueryUtils } from '../../../src/common/SearchQueryUtils';

const eq = (a: SearchQueryDTO, b: SearchQueryDTO) => {
  const sa = SearchQueryUtils.stringifyForComparison(a);
  const sb = SearchQueryUtils.stringifyForComparison(b);
  expect(sa).to.equal(sb);
};

describe('SearchQueryDTOUtils.sortQuery', () => {
  describe('AND and OR ordering', () => {
    it('should treat (A AND B) equal to (B AND A)', () => {
      const A: TextSearch = {type: SearchQueryTypes.keyword, text: 'alpha'};
      const B: TextSearch = {type: SearchQueryTypes.person, text: 'bob'};
      const q1: ANDSearchQuery = {type: SearchQueryTypes.AND, list: [A, B]};
      const q2: ANDSearchQuery = {type: SearchQueryTypes.AND, list: [B, A]};

      eq(q1, q2);

      const s = SearchQueryUtils.sortQuery(q2) as ANDSearchQuery;
      expect((s.list[0] as TextSearch).text).to.equal('alpha');
      expect((s.list[1] as TextSearch).text).to.equal('bob');
    });

    it('should treat (A OR B) equal to (B OR A)', () => {
      const A: TextSearch = {type: SearchQueryTypes.caption, text: 'summer'};
      const B: TextSearch = {type: SearchQueryTypes.directory, text: 'holidays'};
      const q1: ORSearchQuery = {type: SearchQueryTypes.OR, list: [A, B]};
      const q2: ORSearchQuery = {type: SearchQueryTypes.OR, list: [B, A]};

      eq(q1, q2);

      const s = SearchQueryUtils.sortQuery(q1) as ORSearchQuery;
      expect(s.list.map((c) => (c as TextSearch).text)).to.deep.equal(['holidays', 'summer'].sort());
    });
  });

  describe('SOME_OF ordering and min preservation', () => {
    it('should keep min and ignore list order; also preserve negate flags', () => {
      const x1: TextSearch = {type: SearchQueryTypes.keyword, text: 'x'};
      const x2: TextSearch = {type: SearchQueryTypes.person, text: 'y', negate: true};
      const x3: TextSearch = {type: SearchQueryTypes.directory, text: 'z'};

      const q1: SomeOfSearchQuery = {
        type: SearchQueryTypes.SOME_OF,
        min: 2,
        list: [x2, x3, x1],
      };
      const q2: SomeOfSearchQuery = {
        type: SearchQueryTypes.SOME_OF,
        min: 2,
        list: [x1, x2, x3],
      };

      eq(q1, q2);

      const s = SearchQueryUtils.sortQuery(q1) as SomeOfSearchQuery;
      expect(s.min).to.equal(2);
      expect(s.list).to.have.length(3);
      // Ensure all children are present with the same negate flags
      const serializedChildren = s.list.map((c) => SearchQueryUtils.stringifyForComparison(c));
      const expected = [x1, x2, x3].map((c) => SearchQueryUtils.stringifyForComparison(c));
      expect(serializedChildren.sort()).to.deep.equal(expected.sort());

      // Negate flag stayed on the same semantic child (person:y)
      const hasNegPersonY = s.list.some((c) => (c as TextSearch).type === SearchQueryTypes.person && (c as TextSearch).text === 'y' && !!(c as TextSearch).negate);
      expect(hasNegPersonY).to.equal(true);
    });
  });

  describe('Property order canonicalization', () => {
    it('should treat leaf objects with different key orders as equal (TextSearch)', () => {
      // Note: object literal property order differs
      const a1: TextSearch = {type: SearchQueryTypes.directory, text: 'a', matchType: TextSearchQueryMatchTypes.exact_match};
      const a2: any = {text: 'a', matchType: TextSearchQueryMatchTypes.exact_match, type: SearchQueryTypes.directory};

      eq(a1, a2);
    });

    it('should canonicalize nested object keys (DistanceSearch.from and GPSData)', () => {
      const q1: SearchQueryDTO = {
        type: SearchQueryTypes.distance,
        distance: 5,
        from: {
          GPSData: {longitude: 10.123456, latitude: 20.654321},
          text: 'loc',
        },
      } as any;
      const q2: SearchQueryDTO = {
        type: SearchQueryTypes.distance,
        from: {
          text: 'loc',
          GPSData: {latitude: 20.654321, longitude: 10.123456},
        },
        distance: 5,
      } as any;

      eq(q1, q2);

      // Ensure values are preserved after sort
      const s = SearchQueryUtils.sortQuery(q1) as any;
      expect(s.distance).to.equal(5);
      expect(s.from.GPSData.latitude).to.equal(20.654321);
      expect(s.from.GPSData.longitude).to.equal(10.123456);
    });

    it('should ignore undefined vs missing optional properties', () => {
      const a1: TextSearch = {type: SearchQueryTypes.file_name, text: 'IMG_1234', matchType: undefined as any};
      const a2: TextSearch = {type: SearchQueryTypes.file_name, text: 'IMG_1234'};
      eq(a1, a2);
    });
  });

  describe('Nested combinations', () => {
    it('should canonicalize nested AND/OR combinations consistently', () => {
      const A: TextSearch = {type: SearchQueryTypes.keyword, text: 'a'};
      const B: TextSearch = {type: SearchQueryTypes.caption, text: 'b'};

      const q1: ANDSearchQuery = {
        type: SearchQueryTypes.AND,
        list: [
          {type: SearchQueryTypes.OR, list: [A, B]} as ORSearchQuery,
          A,
        ],
      };
      const q2: ANDSearchQuery = {
        type: SearchQueryTypes.AND,
        list: [
          A,
          {type: SearchQueryTypes.OR, list: [B, A]} as ORSearchQuery,
        ],
      };

      eq(q1, q2);
    });
  });
});


// Added tests to cover validateSearchQuery behavior with negate:false
// The validation should not fail merely because a negate:false property exists, even deeply nested.

describe('SearchQueryDTOUtils.validateSearchQuery with negate:false', () => {
  const assertValid = (q: SearchQueryDTO) => {
    expect(() => SearchQueryUtils.validateSearchQuery(q, 'SearchQuery')).to.not.throw();
  };

  it('should validate a top-level leaf with negate:false', () => {
    const q: TextSearch = {type: SearchQueryTypes.person, text: 'alice', negate: false};
    assertValid(q);
  });

  it('should validate an AND with a child having negate:false', () => {
    const q: ANDSearchQuery = {
      type: SearchQueryTypes.AND,
      list: [
        {type: SearchQueryTypes.person, text: 'bob', negate: false} as TextSearch,
        {type: SearchQueryTypes.keyword, text: 'k'} as TextSearch,
      ],
    };
    assertValid(q);
  });

  it('should validate nested OR inside AND where a grandchild has negate:false', () => {
    const q: ANDSearchQuery = {
      type: SearchQueryTypes.AND,
      list: [
        {
          type: SearchQueryTypes.OR,
          list: [
            {type: SearchQueryTypes.directory, text: '/a', negate: false} as TextSearch,
            {type: SearchQueryTypes.caption, text: 'c'} as TextSearch,
          ],
        } as ORSearchQuery,
        {type: SearchQueryTypes.file_name, text: 'IMG'} as TextSearch,
      ],
    };
    assertValid(q);
  });

  it('should validate SOME_OF with negate:false child and min set', () => {
    const q: SomeOfSearchQuery = {
      type: SearchQueryTypes.SOME_OF,
      min: 1,
      list: [
        {type: SearchQueryTypes.keyword, text: 'x', negate: false} as TextSearch,
        {type: SearchQueryTypes.person, text: 'y'} as TextSearch,
      ],
    };
    assertValid(q);
  });
});
