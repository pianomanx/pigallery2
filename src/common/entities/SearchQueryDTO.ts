import {GPSMetadata} from './PhotoDTO';

export enum SearchQueryTypes {
  AND = 1,
  OR,
  SOME_OF,
  UNKNOWN_RELATION = 99999,

  // non-text metadata
  // |- range types
  from_date = 10,
  to_date,
  min_rating,
  max_rating,
  min_resolution,
  max_resolution,
  min_person_count,
  max_person_count,

  distance = 50,
  orientation,


  date_pattern = 60,

  // TEXT search types
  any_text = 100,
  caption,
  directory,
  file_name,
  keyword,
  person,
  position,


}

export const ListSearchQueryTypes = [
  SearchQueryTypes.AND,
  SearchQueryTypes.OR,
  SearchQueryTypes.SOME_OF,
];
export const TextSearchQueryTypes = [
  SearchQueryTypes.any_text,
  SearchQueryTypes.caption,
  SearchQueryTypes.directory,
  SearchQueryTypes.file_name,
  SearchQueryTypes.keyword,
  SearchQueryTypes.person,
  SearchQueryTypes.position,
];
export const MinRangeSearchQueryTypes = [
  SearchQueryTypes.from_date,
  SearchQueryTypes.min_rating,
  SearchQueryTypes.min_resolution,
];
export const MaxRangeSearchQueryTypes = [
  SearchQueryTypes.to_date,
  SearchQueryTypes.max_rating,
  SearchQueryTypes.max_resolution,
];

export const RangeSearchQueryTypes = MinRangeSearchQueryTypes.concat(
    MaxRangeSearchQueryTypes
);

export const MetadataSearchQueryTypes = [
  SearchQueryTypes.distance,
  SearchQueryTypes.orientation,
]
    .concat(RangeSearchQueryTypes)
    .concat(TextSearchQueryTypes);

export const rangedTypePairs: any = {};
rangedTypePairs[SearchQueryTypes.from_date] = SearchQueryTypes.to_date;
rangedTypePairs[SearchQueryTypes.min_rating] = SearchQueryTypes.max_rating;
rangedTypePairs[SearchQueryTypes.min_resolution] =
    SearchQueryTypes.max_resolution;
// add the other direction too
for (const key of Object.keys(rangedTypePairs)) {
  rangedTypePairs[rangedTypePairs[key]] = key;
}

export enum TextSearchQueryMatchTypes {
  exact_match = 1,
  like = 2,
}

export const SearchQueryDTOUtils = {
  getRangedQueryPair: (type: SearchQueryTypes): SearchQueryTypes => {
    if (rangedTypePairs[type]) {
      return rangedTypePairs[type];
    }
    throw new Error('Unknown ranged type');
  },
  negate: (query: SearchQueryDTO): SearchQueryDTO => {
    switch (query.type) {
      case SearchQueryTypes.AND:
        query.type = SearchQueryTypes.OR;
        (query as SearchListQuery).list = (query as SearchListQuery).list.map(
            (q) => SearchQueryDTOUtils.negate(q)
        );
        return query;
      case SearchQueryTypes.OR:
        query.type = SearchQueryTypes.AND;
        (query as SearchListQuery).list = (query as SearchListQuery).list.map(
            (q) => SearchQueryDTOUtils.negate(q)
        );
        return query;

      case SearchQueryTypes.orientation:
        (query as OrientationSearch).landscape = !(query as OrientationSearch)
            .landscape;
        return query;

      case SearchQueryTypes.from_date:
      case SearchQueryTypes.to_date:
      case SearchQueryTypes.min_rating:
      case SearchQueryTypes.max_rating:
      case SearchQueryTypes.min_resolution:
      case SearchQueryTypes.max_resolution:
      case SearchQueryTypes.distance:
      case SearchQueryTypes.any_text:
      case SearchQueryTypes.person:
      case SearchQueryTypes.position:
      case SearchQueryTypes.keyword:
      case SearchQueryTypes.caption:
      case SearchQueryTypes.file_name:
      case SearchQueryTypes.directory:
        (query as NegatableSearchQuery).negate = !(
            query as NegatableSearchQuery
        ).negate;
        return query;

      case SearchQueryTypes.SOME_OF:
        throw new Error('Some of not supported');

      default:
        throw new Error('Unknown type' + query.type);
    }
  },
  isValidQuery(query: SearchQueryDTO): boolean {
    return query && query.type !== undefined && !(query.type === SearchQueryTypes.any_text && !(query as TextSearch).text);
  },
  // Returns a new SearchQueryDTO where list-type subqueries are recursively sorted
  // into a canonical order for equality checks. This does not change semantics.
  sortQuery(queryIN: SearchQueryDTO): SearchQueryDTO {
    // Canonicalize object keys recursively to make JSON order independent
    const canonicalize = (value: any): any => {
      if (Array.isArray(value)) {
        return value.map((v) => canonicalize(v));
      }
      if (value && typeof value === 'object') {
        const out: any = {};
        const keys = Object.keys(value).sort();
        for (const k of keys) {
          const v = canonicalize((value as any)[k]);
          if (v !== undefined) {
            out[k] = v;
          }
        }
        return out;
      }
      return value;
    };

    if (!queryIN || queryIN.type === undefined) {
      return queryIN;
    }
    // Reorder list queries and canonicalize properties
    if (queryIN.type === SearchQueryTypes.AND ||
        queryIN.type === SearchQueryTypes.OR ||
        queryIN.type === SearchQueryTypes.SOME_OF) {
      const ql = queryIN as SearchListQuery;
      const children = (ql.list || []).map((c) => SearchQueryDTOUtils.sortQuery(c));
      // Stable key using JSON.stringify of already-sorted, property-canonicalized children
      const withKeys = children.map((c) => ({ key: JSON.stringify(c), value: c }));
      withKeys.sort((a, b) => a.key.localeCompare(b.key));
      if (queryIN.type === SearchQueryTypes.SOME_OF) {
        const so = queryIN as SomeOfSearchQuery;
        const res: any = { type: queryIN.type };
        if (so.min !== undefined) {
          res.min = so.min;
        }
        res.list = withKeys.map((kv) => kv.value);
        return canonicalize(res) as SearchQueryDTO;
      } else {
        const res: any = { type: queryIN.type };
        res.list = withKeys.map((kv) => kv.value);
        return canonicalize(res) as SearchQueryDTO;
      }
    }
    // For non-list queries return with sorted properties to avoid order differences
    return canonicalize(queryIN) as SearchQueryDTO;
  },
  // Stringify a query in canonical form for comparing or persistence
  stringifyForComparison(queryIN: SearchQueryDTO): string {
    return JSON.stringify(SearchQueryDTOUtils.sortQuery(queryIN));
  }
};

export interface SearchQueryDTO {
  type: SearchQueryTypes;
}

export interface NegatableSearchQuery extends SearchQueryDTO {
  negate?: boolean; // if true negates the expression
}

export interface SearchListQuery extends SearchQueryDTO {
  list: SearchQueryDTO[];
}

export interface ANDSearchQuery extends SearchQueryDTO, SearchListQuery {
  type: SearchQueryTypes.AND;
  list: SearchQueryDTO[];
}

export interface ORSearchQuery extends SearchQueryDTO, SearchListQuery {
  type: SearchQueryTypes.OR;
  list: SearchQueryDTO[];
}

export interface SomeOfSearchQuery extends SearchQueryDTO, SearchListQuery {
  type: SearchQueryTypes.SOME_OF;
  list: NegatableSearchQuery[];
  min?: number; // at least this amount of items
}

export interface TextSearch extends NegatableSearchQuery {
  type:
      | SearchQueryTypes.any_text
      | SearchQueryTypes.person
      | SearchQueryTypes.keyword
      | SearchQueryTypes.position
      | SearchQueryTypes.caption
      | SearchQueryTypes.file_name
      | SearchQueryTypes.directory;
  matchType?: TextSearchQueryMatchTypes;
  text: string;
}

export interface DistanceSearch extends NegatableSearchQuery {
  type: SearchQueryTypes.distance;
  from: {
    text?: string;
    GPSData?: GPSMetadata;
  };
  distance: number; // in kms
}

export interface RangeSearch extends NegatableSearchQuery {
  value: number;
}

export interface FromDateSearch extends RangeSearch {
  type: SearchQueryTypes.from_date;
  value: number;
}

export interface ToDateSearch extends RangeSearch {
  type: SearchQueryTypes.to_date;
  value: number;
}

export interface MinRatingSearch extends RangeSearch {
  type: SearchQueryTypes.min_rating;
  value: number;
}

export interface MaxRatingSearch extends RangeSearch {
  type: SearchQueryTypes.max_rating;
  value: number;
}


export interface MinPersonCountSearch extends RangeSearch {
  type: SearchQueryTypes.min_person_count;
  value: number;
}

export interface MaxPersonCountSearch extends RangeSearch {
  type: SearchQueryTypes.max_person_count;
  value: number;
}

export interface MinResolutionSearch extends RangeSearch {
  type: SearchQueryTypes.min_resolution;
  value: number; // in megapixels
}

export interface MaxResolutionSearch extends RangeSearch {
  type: SearchQueryTypes.max_resolution;
  value: number; // in megapixels
}

export interface OrientationSearch {
  type: SearchQueryTypes.orientation;
  landscape: boolean;
}

export enum DatePatternFrequency {
  every_week = 1, every_month, every_year,
  days_ago = 10, weeks_ago, months_ago, years_ago
}

export interface DatePatternSearch extends NegatableSearchQuery {
  type: SearchQueryTypes.date_pattern;
  daysLength: number; // days
  frequency: DatePatternFrequency;
  agoNumber?: number;
  negate?: boolean;
}

