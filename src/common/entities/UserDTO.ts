export enum UserRoles {
  LimitedGuest = 1,
  Guest = 2,
  User = 3,
  Admin = 4,
  Developer = 5,
}

export interface UserDTO {
  id: number;
  name: string;
  password?: string;
  role: UserRoles;
  usedSharingKey?: string;
  projectionKey?: string; // allow- and blocklist projection hash. if null, no projection
}
