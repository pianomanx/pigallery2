import {Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn, Unique} from 'typeorm';
import {MediaEntity} from './MediaEntity';
import {DirectoryEntity} from './DirectoryEntity';
import {DirectoryCacheDTO} from '../../../../common/entities/DirectoryDTO';

@Entity()
@Unique(['projectionKey', 'directory'])
export class ProjectedDirectoryCacheEntity implements DirectoryCacheDTO {
  @PrimaryGeneratedColumn({unsigned: true})
  id: number;

  @Index()
  @Column({type: 'text', select: false}) // don't select it, we only use it to get the right cache for the given context
  projectionKey: string; //it's a hash of the projection search query

  @Index()
  @ManyToOne(() => DirectoryEntity, {
    onDelete: 'CASCADE',
    nullable: false
  })
  directory: DirectoryEntity;

  @Column('int', {unsigned: true, default: 0})
  mediaCount: number;

  @Column('int', {unsigned: true, default: 0})
  recursiveMediaCount?: number;

  @Column('bigint', {nullable: true, unsigned: true, transformer: {from: (v) => v == null ? null : parseInt(v, 10), to: (v) => v}})
  oldestMedia: number;

  @Column('bigint', {nullable: true, unsigned: true, transformer: {from: (v) => v == null ? null : parseInt(v, 10), to: (v) => v}})
  youngestMedia: number;

  @ManyToOne(() => MediaEntity, {onDelete: 'SET NULL', nullable: true})
  cover: MediaEntity;

  @Column({type: 'boolean', default: false})
  valid: boolean;
}
