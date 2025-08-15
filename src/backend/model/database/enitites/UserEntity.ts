import {UserDTO, UserRoles} from '../../../../common/entities/UserDTO';
import {Column, Entity, PrimaryGeneratedColumn, Unique} from 'typeorm';
import {SearchQueryDTO} from '../../../../common/entities/SearchQueryDTO';

@Entity()
@Unique(['name'])
export class UserEntity implements UserDTO {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  password: string;

  @Column('smallint')
  role: UserRoles;

  @Column('simple-array', {nullable: true})
  permissions: string[];

  // only if this set to true, will the per-user allow/blocklist be considered
  @Column({type: 'boolean', default: false})
  overrideAllowBlockList?: boolean;

  @Column({
    type: 'text',
    nullable: true,
    transformer: {
      from: (val: string) => {
        return val ? JSON.parse(val) : null;
      },
      to: (val: object) => {
        return val ? JSON.stringify(val) : null;
      },
    },
  })
  allowQuery?: SearchQueryDTO;

  @Column({
    type: 'text',
    nullable: true,
    transformer: {
      from: (val: string) => {
        return val ? JSON.parse(val) : null;
      },
      to: (val: object) => {
        return val ? JSON.stringify(val) : null;
      },
    },
  })
  blockQuery?: SearchQueryDTO;
}
