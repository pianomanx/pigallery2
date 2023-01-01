import {Component, Input, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {AuthenticationService} from '../../../model/network/authentication.service';
import {NavigationService} from '../../../model/navigation.service';
import {NotificationService} from '../../../model/notification.service';
import {SettingsService} from '../settings.service';
import {WebConfig} from '../../../../../common/config/private/WebConfig';
import {JobProgressDTO} from '../../../../../common/entities/job/JobProgressDTO';
import {JobDTOUtils} from '../../../../../common/entities/job/JobDTO';
import {ScheduledJobsService} from '../scheduled-jobs.service';
import {FormControl} from '../../../../../../node_modules/@angular/forms';
import {Subscription} from 'rxjs';
import {IWebConfigClassPrivate} from '../../../../../../node_modules/typeconfig/src/decorators/class/IWebConfigClass';
import {ConfigPriority, TAGS} from '../../../../../common/config/public/ClientConfig';
import {Utils} from '../../../../../common/Utils';
import {UserRoles} from '../../../../../common/entities/UserDTO';
import {WebConfigClassBuilder} from '../../../../../../node_modules/typeconfig/src/decorators/builders/WebConfigClassBuilder';
import {ErrorDTO} from '../../../../../common/entities/Error';
import {ISettingsComponent} from './ISettingsComponent';


interface ConfigState {
  value: {
    [key: string]: RecursiveState;
  };
  default: {
    [key: string]: RecursiveState;
  };
  readonly?: boolean;
  tags?: TAGS;
  volatile?: boolean;
  isEnumType?: boolean;
  isConfigType?: boolean;
  isConfigArrayType?: boolean;
}

export interface RecursiveState extends ConfigState {
  value: any;
  default: any;
  volatile?: any;
  tags?: any;
  isConfigType?: any;
  isConfigArrayType?: any;
  isEnumType?: any;
  readonly?: any;
  toJSON?: any;
  onChange?: any;
  original?: any;
  shouldHide?: any;

  [key: string]: RecursiveState;
}

@Component({
  selector: 'app-settings-template',
  templateUrl: './template.component.html',
  styleUrls: ['./template.component.css']
})
export class TemplateComponent implements OnInit, OnDestroy, ISettingsComponent {

  public icon: string;
  @Input() ConfigPath: string;

  @ViewChild('settingsForm', {static: true})
  form: FormControl;


  public inProgress = false;
  public error: string = null;
  public changed = false;
  public states: RecursiveState = {} as RecursiveState;
  protected name: string;

  private subscription: Subscription = null;
  private settingsSubscription: Subscription = null;
  protected sliceFN?: (s: IWebConfigClassPrivate<TAGS> & WebConfig) => ConfigState;

  constructor(
    protected authService: AuthenticationService,
    private navigation: NavigationService,
    protected notification: NotificationService,
    public settingsService: SettingsService,
    public jobsService: ScheduledJobsService,
  ) {
  }


  ngOnInit(): void {

    if (
      !this.authService.isAuthenticated() ||
      this.authService.user.value.role < UserRoles.Admin
    ) {
      this.navigation.toLogin();
      return;
    }
    this.getSettings();

    // TODO: fix after this issue is fixed: https://github.com/angular/angular/issues/24818
    this.subscription = this.form.valueChanges.subscribe(() => {
      this.onOptionChange();
    });

    if (!this.ConfigPath) {
      this.setSliceFN(c => ({value: c as any, isConfigType: true, type: WebConfig} as any));
    } else {
      this.setSliceFN(c => c.__state[this.ConfigPath]);
    }
    this.name = this.states.tags?.name || this.ConfigPath;
  }


  ngOnDestroy(): void {
    if (this.subscription != null) {
      this.subscription.unsubscribe();
    }
    if (this.settingsSubscription != null) {
      this.settingsSubscription.unsubscribe();
    }
  }


  setSliceFN(sliceFN?: (s: IWebConfigClassPrivate<TAGS> & WebConfig) => ConfigState) {
    if (sliceFN) {
      this.sliceFN = sliceFN;
      this.settingsSubscription = this.settingsService.settings.subscribe(
        this.onNewSettings
      );
    }
  }

  get Name(): string {
    return this.changed ? this.name + '*' : this.name;
  }

  get Changed(): boolean {
    return this.changed;
  }

  get HasAvailableSettings(): boolean {
    return !this.states?.shouldHide || !this.states?.shouldHide();
  }

  onNewSettings = (s: IWebConfigClassPrivate<TAGS> & WebConfig) => {
    this.states = this.sliceFN(s.clone()) as RecursiveState;

    const instrument = (st: RecursiveState, parent: RecursiveState) => {
      const shouldHide = (state: RecursiveState) => {
        return () => {
          if (state.volatile) {
            return true;
          }

          if (state.tags &&
            ((state.tags.relevant && !state.tags.relevant(parent.value))
              || state.tags.secret)) {
            return true;
          }

          // if all sub elements are hidden, hide the parent too.
          if (state.isConfigType) {
            if (state.value.__state &&
              Object.keys(state.value.__state).findIndex(k => !st.value.__state[k].shouldHide()) === -1) {
              return true;
            }
          }


          if (state.isConfigArrayType) {
            for (let i = 0; i < state.value?.length; ++i) {
              if (state.value[i].__state &&
                Object.keys(state.value[i].__state).findIndex(k => !(st.value[i].__state[k].shouldHide && st.value[i].__state[k].shouldHide())) === -1) {
                return true;
              }
            }
            return false;
          }
          return (
            (state.tags?.priority > this.settingsService.configPriority ||
              (this.settingsService.configPriority === ConfigPriority.basic &&
                state.tags?.dockerSensitive && this.settingsService.settings.value.Environment.isDocker)) && //if this value should not change in Docker, lets hide it
            Utils.equalsFilter(state.value, state.default,
              ['__propPath', '__created', '__prototype', '__rootConfig']) &&
            Utils.equalsFilter(state.original, state.default,
              ['__propPath', '__created', '__prototype', '__rootConfig']));
        };
      };

      st.shouldHide = shouldHide(st);
      st.onChange = this.onOptionChange;
      st.rootConfig = parent?.value;
      if (typeof st.value !== 'undefined') {
        st.original = Utils.clone(st.value);
      }

      if (st.isConfigType) {
        for (const k of Object.keys(st.value.__state)) {
          instrument(st.value.__state[k], st);
        }
      }
      if (st.isConfigArrayType) {
        for (let i = 0; i < st.value?.length; ++i) {
          for (const k of Object.keys(st.value[i].__state)) {
            instrument(st.value[i].__state[k], st);
          }
        }
      }
    };

    instrument(this.states, null);
    this.icon = this.states.tags?.uiIcon;
  };

  onOptionChange = () => {
    setTimeout(() => {
      const settingsSame = (state: RecursiveState): boolean => {
        if (typeof state === 'undefined') {
          return true;
        }
        if (typeof state.original === 'object') {
          return Utils.equalsFilter(state.value, state.original,
            ['__propPath', '__created', '__prototype', '__rootConfig', '__state']);
        }
        if (typeof state.original !== 'undefined') {
          return state.value === state.original;
        }

        const keys = Object.keys(state);

        for (const key of keys) {
          if (settingsSame(state[key]) === false) {
            return false;
          }
        }

        return true;
      };

      this.changed = !settingsSame(this.states);
    }, 0);
  };

  public reset(): void {
    this.getSettings();
  }


  public async save(): Promise<boolean> {
    this.inProgress = true;
    this.error = '';
    try {
      const state = WebConfigClassBuilder.attachInterface(this.states.value).toJSON();
      await this.settingsService.updateSettings(state, this.ConfigPath);
      await this.getSettings();
      this.notification.success(
        this.Name + ' ' + $localize`settings saved`,
        $localize`Success`
      );
      this.inProgress = false;
      return true;
    } catch (err) {
      console.error(err);
      if (err.message) {
        this.error = (err as ErrorDTO).message;
      }
    }

    this.inProgress = false;
    return false;
  }

  private async getSettings(): Promise<void> {
    await this.settingsService.getSettings();
    this.changed = false;
  }

  getKeys(states: any): string[] {
    if (states.keys) {
      return states.keys;
    }
    const s = states.value.__state;
    const keys = Object.keys(s).sort((a, b) => {
      if ((s[a].isConfigType || s[a].isConfigArrayType) !== (s[b].isConfigType || s[b].isConfigArrayType)) {
        if (s[a].isConfigType || s[a].isConfigArrayType) {
          return 1;
        } else {
          return -1;
        }
      }
      if (s[a].tags?.priority !== s[b].tags?.priority) {
        return s[a].tags?.priority - s[b].tags?.priority;
      }

      return (s[a].tags?.name as string || a).localeCompare(s[b].tags?.name || b);

    });
    states.keys = keys;
    return states.keys;
  }

  getProgress(jobName: string): JobProgressDTO {
    return this.jobsService.progress.value[JobDTOUtils.getHashName(jobName)];
  }
}