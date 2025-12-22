import {expect} from 'chai';
import {
  ANDSearchQuery,
  DatePatternFrequency,
  DatePatternSearch,
  DistanceSearch,
  FromDateSearch,
  MaxPersonCountSearch,
  MaxRatingSearch,
  MaxResolutionSearch, MinPersonCountSearch,
  MinRatingSearch,
  MinResolutionSearch,
  OrientationSearch,
  ORSearchQuery,
  RangeSearch,
  SearchQueryDTO,
  SearchQueryTypes,
  SomeOfSearchQuery,
  TextSearch,
  TextSearchQueryMatchTypes,
  ToDateSearch
} from '../../../src/common/entities/SearchQueryDTO';
import {defaultQueryKeywords, SearchQueryParser} from '../../../src/common/SearchQueryParser';


describe('SearchQueryParser', () => {

  const check = (query: SearchQueryDTO) => {
    const parser = new SearchQueryParser(defaultQueryKeywords);
    expect(parser.parse(parser.stringify(query))).to.deep.equals(query, parser.stringify(query));

  };

  describe('should serialize and deserialize', () => {
    it('Text search', () => {
      check({type: SearchQueryTypes.any_text, value: 'test'} as TextSearch);
      check({type: SearchQueryTypes.person, value: 'person_test'} as TextSearch);
      check({type: SearchQueryTypes.directory, value: 'directory'} as TextSearch);
      check({type: SearchQueryTypes.directory, value: '2000.10.15 (Some event)'} as TextSearch);
      check({
        type: SearchQueryTypes.directory,
        value: '2000.10.15 (Some event)',
        matchType: TextSearchQueryMatchTypes.exact_match
      } as TextSearch);
      check({type: SearchQueryTypes.directory, value: '2000.10.15 (Some event) '} as TextSearch);
      check({type: SearchQueryTypes.keyword, value: 'big boom'} as TextSearch);
      check({type: SearchQueryTypes.caption, value: 'caption'} as TextSearch);
      check({type: SearchQueryTypes.file_name, value: 'filename'} as TextSearch);
      check({type: SearchQueryTypes.position, value: 'New York'} as TextSearch);
      check({
        type: SearchQueryTypes.position,
        matchType: TextSearchQueryMatchTypes.exact_match,
        value: 'New York'
      } as TextSearch);
      check({
        type: SearchQueryTypes.position,
        matchType: TextSearchQueryMatchTypes.exact_match,
        negate: true,
        value: 'New York'
      } as TextSearch);

      check({type: SearchQueryTypes.any_text, value: 'test', negate: true} as TextSearch);
    });

    it('Date search', () => {
      check({type: SearchQueryTypes.from_date, value: (Date.UTC(2020, 1, 10))} as FromDateSearch);
      check({type: SearchQueryTypes.from_date, value: (Date.UTC(2020, 1, 1))} as FromDateSearch);
      check({type: SearchQueryTypes.to_date, value: (Date.UTC(2020, 1, 20))} as ToDateSearch);
      check({type: SearchQueryTypes.to_date, value: (Date.UTC(2020, 1, 1))} as ToDateSearch);
      check({type: SearchQueryTypes.from_date, value: (Date.UTC(2020, 1, 1)), negate: true} as FromDateSearch);
      check({type: SearchQueryTypes.to_date, value: (Date.UTC(2020, 1, 1)), negate: true} as ToDateSearch);

      const parser = new SearchQueryParser(defaultQueryKeywords);

      let query: RangeSearch = ({type: SearchQueryTypes.from_date, value: (Date.UTC(2020, 1, 4))} as FromDateSearch);
      expect(parser.parse(defaultQueryKeywords.from + ':' + '2020-02-04'))
        .to.deep.equals(query, parser.stringify(query));

      expect(parser.parse(defaultQueryKeywords.from + ':' + '2020-2-4'))
        .to.deep.equals(query, parser.stringify(query));

      query = ({type: SearchQueryTypes.from_date, value: (Date.UTC(2020, 1, 1))} as FromDateSearch);
      expect(parser.parse(defaultQueryKeywords.from + ':' + (new Date(query.value)).getFullYear() + '-' + '02'))
        .to.deep.equals(query, parser.stringify(query));

      // test if date gets simplified on 1st of Jan.
      query = {type: SearchQueryTypes.to_date, value: (Date.UTC(2020, 0, 1))} as ToDateSearch;
      expect(parser.parse(defaultQueryKeywords.to + ':' + (new Date(query.value)).getFullYear()))
        .to.deep.equals(query, parser.stringify(query));

      query = ({type: SearchQueryTypes.from_date, value: (Date.UTC(2020, 0, 1))} as FromDateSearch);
      expect(parser.parse(defaultQueryKeywords.from + ':' + (new Date(query.value)).getFullYear()))
        .to.deep.equals(query, parser.stringify(query));

    });
    it('Rating search', () => {
      check({type: SearchQueryTypes.min_rating, value: 10} as MinRatingSearch);
      check({type: SearchQueryTypes.max_rating, value: 1} as MaxRatingSearch);
      check({type: SearchQueryTypes.min_rating, value: 10, negate: true} as MinRatingSearch);
      check({type: SearchQueryTypes.max_rating, value: 1, negate: true} as MaxRatingSearch);
    });
    it('Person count search', () => {
      check({type: SearchQueryTypes.min_person_count, value: 10} as MinPersonCountSearch);
      check({type: SearchQueryTypes.max_person_count, value: 1} as MaxPersonCountSearch);
      check({type: SearchQueryTypes.min_person_count, value: 10, negate: true} as MinPersonCountSearch);
      check({type: SearchQueryTypes.max_person_count, value: 1, negate: true} as MaxPersonCountSearch);
    });
    it('Resolution search', () => {
      check({type: SearchQueryTypes.min_resolution, value: 10} as MinResolutionSearch);
      check({type: SearchQueryTypes.max_resolution, value: 5} as MaxResolutionSearch);
      check({type: SearchQueryTypes.min_resolution, value: 10, negate: true} as MinResolutionSearch);
      check({type: SearchQueryTypes.max_resolution, value: 5, negate: true} as MaxResolutionSearch);
    });
    it('Distance search', () => {
      // Test location-based distance search
      check({type: SearchQueryTypes.distance, distance: 10, from: {value: 'New York'}} as DistanceSearch);
      check({type: SearchQueryTypes.distance, distance: 10, from: {value: 'New York'}, negate: true} as DistanceSearch);

      // Test coordinate-based distance search
      check({
        type: SearchQueryTypes.distance,
        distance: 5,
        from: {
          GPSData: {
            latitude: 40.712776,
            longitude: -74.005974
          }
        }
      } as DistanceSearch);

      // Test coordinate-based distance search with negation
      check({
        type: SearchQueryTypes.distance,
        distance: 5,
        from: {
          GPSData: {
            latitude: 40.712776,
            longitude: -74.005974
          }
        },
        negate: true
      } as DistanceSearch);

      // Test parsing specific coordinate formats
      const parser = new SearchQueryParser(defaultQueryKeywords);

      // Test basic coordinate format
      expect(parser.parse('5-km-from:(40.712776, -74.005974)')).to.deep.equals({
        type: SearchQueryTypes.distance,
        distance: 5,
        from: {
          GPSData: {
            latitude: 40.712776,
            longitude: -74.005974
          }
        }
      } as DistanceSearch);

      // Test coordinate format with extra spaces
      expect(parser.parse('5-km-from:(  40.712776  ,  -74.005974  )')).to.deep.equals({
        type: SearchQueryTypes.distance,
        distance: 5,
        from: {
          GPSData: {
            latitude: 40.712776,
            longitude: -74.005974
          }
        }
      } as DistanceSearch);

      // Test coordinates with different decimal places
      expect(parser.parse('5-km-from:(40.7, -74.1)')).to.deep.equals({
        type: SearchQueryTypes.distance,
        distance: 5,
        from: {
          GPSData: {
            latitude: 40.7,
            longitude: -74.1
          }
        }
      } as DistanceSearch);

      // Test negated coordinate search
      expect(parser.parse('5-km-from!:(40.712776, -74.005974)')).to.deep.equals({
        type: SearchQueryTypes.distance,
        distance: 5,
        from: {
          GPSData: {
            latitude: 40.712776,
            longitude: -74.005974
          }
        },
        negate: true
      } as DistanceSearch);

      // Test stringification of coordinates
      const query: DistanceSearch = {
        type: SearchQueryTypes.distance,
        distance: 5,
        from: {
          GPSData: {
            latitude: 40.712776,
            longitude: -74.005974
          }
        }
      };
      expect(parser.stringify(query)).to.equals('5-km-from:(40.712776, -74.005974)');

      // Test stringification of negated coordinates
      const negatedQuery: DistanceSearch = {
        ...query,
        negate: true
      };
      expect(parser.stringify(negatedQuery)).to.equals('5-km-from!:(40.712776, -74.005974)');
    });
    it('OrientationSearch search', () => {
      check({type: SearchQueryTypes.orientation, landscape: true} as OrientationSearch);
      check({type: SearchQueryTypes.orientation, landscape: false} as OrientationSearch);
    });
    it('Date patter search', () => {
      for (let i = 0; i <= 10; ++i) {
        check({
          type: SearchQueryTypes.date_pattern, daysLength: i,
          frequency: DatePatternFrequency.every_week
        } as DatePatternSearch);
        check({
          type: SearchQueryTypes.date_pattern, daysLength: i,
          frequency: DatePatternFrequency.every_month
        } as DatePatternSearch);
        check({
          type: SearchQueryTypes.date_pattern, daysLength: i,
          frequency: DatePatternFrequency.every_year
        } as DatePatternSearch);
        check({
          type: SearchQueryTypes.date_pattern, daysLength: i,
          frequency: DatePatternFrequency.days_ago,
          agoNumber: 0
        } as DatePatternSearch);
        check({
          type: SearchQueryTypes.date_pattern, daysLength: i,
          frequency: DatePatternFrequency.days_ago,
          agoNumber: 1
        } as DatePatternSearch);
        check({
          type: SearchQueryTypes.date_pattern, daysLength: i,
          frequency: DatePatternFrequency.weeks_ago,
          agoNumber: 1
        } as DatePatternSearch);
        check({
          type: SearchQueryTypes.date_pattern, daysLength: i,
          frequency: DatePatternFrequency.months_ago,
          agoNumber: 1
        } as DatePatternSearch);
        check({
          type: SearchQueryTypes.date_pattern, daysLength: i,
          frequency: DatePatternFrequency.years_ago,
          agoNumber: 1
        } as DatePatternSearch);
        check({
          type: SearchQueryTypes.date_pattern, daysLength: i,
          frequency: DatePatternFrequency.years_ago,
          agoNumber: 1,
          negate: true
        } as DatePatternSearch);
      }
    });
    it('Default logical operator should be AND', () => {

      const parser = new SearchQueryParser(defaultQueryKeywords);
      expect(parser.parse('a b')).to.deep.equals({
        type: SearchQueryTypes.AND,
        list: [
          {type: SearchQueryTypes.any_text, value: 'a'} as TextSearch,
          {type: SearchQueryTypes.any_text, value: 'b'} as TextSearch
        ]
      } as ANDSearchQuery);
    });
    it('And search', () => {
      check({
        type: SearchQueryTypes.AND,
        list: [
          {type: SearchQueryTypes.keyword, value: 'big boom'} as TextSearch,
          {type: SearchQueryTypes.position, value: 'New York'} as TextSearch
        ]
      } as ANDSearchQuery);

      check({
        type: SearchQueryTypes.AND,
        list: [
          {type: SearchQueryTypes.keyword, value: 'big boom'} as TextSearch,
          {
            type: SearchQueryTypes.position,
            matchType: TextSearchQueryMatchTypes.exact_match,
            value: 'New York'
          } as TextSearch
        ]
      } as ANDSearchQuery);
      check({
        type: SearchQueryTypes.AND,
        list: [
          {type: SearchQueryTypes.keyword, value: 'big boom'} as TextSearch,
          {type: SearchQueryTypes.caption, value: 'caption'} as TextSearch,
          {type: SearchQueryTypes.position, value: 'New York'} as TextSearch
        ]
      } as ANDSearchQuery);
      check({
        type: SearchQueryTypes.AND,
        list: [
          {
            type: SearchQueryTypes.SOME_OF,
            min: 2,
            list: [
              {type: SearchQueryTypes.keyword, value: 'big boom'} as TextSearch,
              {type: SearchQueryTypes.position, value: 'New York'} as TextSearch,
              {type: SearchQueryTypes.caption, value: 'caption test'} as TextSearch
            ]
          } as SomeOfSearchQuery,
          {type: SearchQueryTypes.position, value: 'New York'} as TextSearch
        ]
      } as ANDSearchQuery);
    });
    it('Or search', () => {
      check({
        type: SearchQueryTypes.OR,
        list: [
          {type: SearchQueryTypes.keyword, value: 'big boom'} as TextSearch,
          {type: SearchQueryTypes.position, value: 'New York'} as TextSearch
        ]
      } as ORSearchQuery);
      check({
        type: SearchQueryTypes.OR,
        list: [
          {type: SearchQueryTypes.keyword, value: 'big boom'} as TextSearch,
          {type: SearchQueryTypes.person, value: 'person_test'} as TextSearch,
          {type: SearchQueryTypes.position, value: 'New York'} as TextSearch
        ]
      } as ORSearchQuery);
    });
    it('Some of search', () => {
      check({
        type: SearchQueryTypes.SOME_OF,
        list: [
          {type: SearchQueryTypes.keyword, value: 'big boom'} as TextSearch,
          {type: SearchQueryTypes.position, value: 'New York'} as TextSearch
        ]
      } as SomeOfSearchQuery);
      check({
        type: SearchQueryTypes.SOME_OF,
        list: [
          {
            type: SearchQueryTypes.keyword,
            matchType: TextSearchQueryMatchTypes.exact_match,
            value: 'big boom'
          } as TextSearch,
          {
            type: SearchQueryTypes.position,
            matchType: TextSearchQueryMatchTypes.exact_match,
            value: 'New York'
          } as TextSearch,
        ]
      } as SomeOfSearchQuery);
      check({
        type: SearchQueryTypes.SOME_OF,
        min: 2,
        list: [
          {type: SearchQueryTypes.keyword, value: 'big boom'} as TextSearch,
          {type: SearchQueryTypes.position, value: 'New York'} as TextSearch,
          {type: SearchQueryTypes.caption, value: 'caption test'} as TextSearch
        ]
      } as SomeOfSearchQuery);
      check({
        type: SearchQueryTypes.SOME_OF,
        min: 2,
        list: [
          {type: SearchQueryTypes.keyword, value: 'big boom'} as TextSearch,
          {type: SearchQueryTypes.person, value: 'person_test'} as TextSearch,
          {
            type: SearchQueryTypes.AND,
            list: [
              {type: SearchQueryTypes.caption, value: 'caption'} as TextSearch,
              {type: SearchQueryTypes.position, value: 'New York'} as TextSearch
            ]
          } as ANDSearchQuery
        ]
      } as SomeOfSearchQuery);
    });
  });


});
