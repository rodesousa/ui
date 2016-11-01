import Resource from 'ember-api-store/models/resource';
import Ember from 'ember';
import C from 'ui/utils/constants';
import Util from 'ui/utils/util';
import { denormalizeId } from 'ember-api-store/utils/denormalize';
import { denormalizeInstanceArray, getByServiceId } from 'ui/utils/denormalize-snowflakes';

var Service = Resource.extend({
  type: 'service',
  intl: Ember.inject.service(),
  growl: Ember.inject.service(),
  modalService: Ember.inject.service('modal'),

  instances: denormalizeInstanceArray('instanceIds'),
  instanceCount: Ember.computed.alias('instances.length'),
  stack: denormalizeId('stackId'),

  actions: {
    activate() {
      return this.doAction('activate');
    },

    deactivate() {
      return this.doAction('deactivate');
    },

    restart() {
      return this.doAction('restart', {rollingRestartStrategy: {}});
    },

    cancelUpgrade() {
      return this.doAction('cancelupgrade');
    },

    cancelRollback() {
      return this.doAction('cancelrollback');
    },

    finishUpgrade() {
      return this.doAction('finishupgrade');
    },

    rollback() {
      return this.doAction('rollback');
    },

    promptStop: function() {
      this.get('modalService').toggleModal('modal-confirm-deactivate', {
        originalModel: this,
        action: 'deactivate'
      });
    },

    edit() {
      var type = this.get('type').toLowerCase();
      if ( type === 'loadbalancerservice' )
      {
        this.get('modalService').toggleModal('edit-balancerservice', this);
      }
      else if ( type === 'dnsservice' )
      {
        this.get('modalService').toggleModal('edit-aliasservice', this);
      }
      else if ( type === 'externalservice' )
      {
        this.get('modalService').toggleModal('edit-externalservice', this);
      }
      else
      {
        this.get('modalService').toggleModal('edit-service', this);
      }
    },

    scaleUp() {
      this.incrementProperty('scale');
      this.saveScale();
    },

    scaleDown() {
      if ( this.get('scale') >= 1 )
      {
        this.decrementProperty('scale');
        this.saveScale();
      }
    },

    upgrade() {
      var route = 'service.new';
      if ( (this.get('launchConfig.kind')||'').toLowerCase() === 'virtualmachine') {
        route = 'service.new-virtualmachine';
      } else if ( this.get('type').toLowerCase() === 'loadbalancerservice' ) {
        route = 'service.new-balancer';
      }

      this.get('application').transitionToRoute(route, {queryParams: {
        serviceId: this.get('id'),
        upgrade: true,
        stackId: this.get('stackId'),
      }});
    },

    clone() {
      var route;
      switch ( this.get('type').toLowerCase() )
      {
        case 'service':
          if ( (this.get('launchConfig.kind')||'').toLowerCase() === 'virtualmachine')
          {
            route = 'service.new-virtualmachine';
          }
          else
          {
            route = 'service.new';
          }
          break;
        case 'dnsservice':          route = 'service.new-alias';    break;
        case 'loadbalancerservice': route = 'service.new-balancer'; break;
        case 'externalservice':     route = 'service.new-external'; break;
        default: return void this.send('error','Unknown service type: ' + this.get('type'));
      }

      this.get('application').transitionToRoute(route, {queryParams: {
        serviceId: this.get('id'),
        stackId: this.get('stackId'),
      }});
    },
  },

  scaleTimer: null,
  saveScale() {
    if ( this.get('scaleTimer') )
    {
      Ember.run.cancel(this.get('scaleTimer'));
    }

    var timer = Ember.run.later(this, function() {
      this.save().catch((err) => {
        this.get('growl').fromError('Error updating scale',err);
      });
    }, 500);

    this.set('scaleTimer', timer);
  },

  availableActions: function() {
    var a = this.get('actionLinks');

    var canUpgrade = !!a.upgrade && this.get('canUpgrade');
    var isK8s = this.get('isK8s');
    var isSwarm = this.get('isSwarm');
    var hasContainers = this.get('hasContainers');
    var isDriver = ['networkdriverservice','storagedriverservice'].includes(this.get('type').toLowerCase());

    var choices = [
      { label: 'action.start',          icon: 'icon icon-play',             action: 'activate',       enabled: !!a.activate},
      { label: 'action.finishUpgrade',  icon: 'icon icon-success',          action: 'finishUpgrade',  enabled: !!a.finishupgrade },
      { label: 'action.rollback',       icon: 'icon icon-history',          action: 'rollback',       enabled: !!a.rollback },
      { label: 'action.upgrade',        icon: 'icon icon-arrow-circle-up',  action: 'upgrade',        enabled: canUpgrade },
      { label: 'action.cancelUpgrade',  icon: 'icon icon-life-ring',        action: 'cancelUpgrade',  enabled: !!a.cancelupgrade },
      { label: 'action.cancelRollback', icon: 'icon icon-life-ring',        action: 'cancelRollback', enabled: !!a.cancelrollback },
      { divider: true },
      { label: 'action.restart',        icon: 'icon icon-refresh'    ,      action: 'restart',        enabled: !!a.restart && hasContainers },
      { label: 'action.stop',           icon: 'icon icon-stop',             action: 'promptStop',     enabled: !!a.deactivate, altAction: 'deactivate'},
      { label: 'action.remove',         icon: 'icon icon-trash',            action: 'promptDelete',   enabled: !!a.remove, altAction: 'delete'},
      { label: 'action.purge',          icon: '',                           action: 'purge',          enabled: !!a.purge},
      { divider: true },
      { label: 'action.viewInApi',      icon: 'icon icon-external-link',    action: 'goToApi',        enabled: true },
      { label: 'action.clone',          icon: 'icon icon-copy',             action: 'clone',          enabled: !isK8s && !isSwarm && !isDriver },
      { label: 'action.edit',           icon: 'icon icon-edit',             action: 'edit',           enabled: !!a.update && !isK8s && !isSwarm },
    ];

    return choices;
  }.property('actionLinks.{activate,deactivate,restart,update,remove,purge,finishupgrade,cancelupgrade,rollback,cancelrollback}','type','isK8s','isSwarm','hasContainers','canUpgrade'),


  serviceLinks: null, // Used for clone
  reservedKeys: [
    'serviceLinks',
  ],

  init() {
    this._super();
  },

  displayStack: function() {
    var stack = this.get('stack');
    if ( stack ) {
      return stack.get('displayName');
    } else {
      return '...';
    }
  }.property('stack.displayName'),

  consumedServicesWithNames: function() {
    let store = this.get('store');
    let links = this.get('linkedServices')||{};
    let out = Object.keys(links).map((key) => {
      return Ember.Object.create({
        name: key,
        service: getByServiceId(store, links[key])
      });
    });

    return out;
  }.property('linkedServices'),

  // Only for old Load Balancer to get ports map
  consumedServicesWithNamesAndPorts: function() {
    let store = this.get('store');
    return store.all('serviceconsumemap').filterBy('serviceId', this.get('id')).map((map) => {
      return Ember.Object.create({
        name: map.get('name'),
        service: getByServiceId(store, map.get('consumedServiceId')),
        ports: map.get('ports')||[],
      });
    }).filter((obj) => {
      return obj && obj.get('service.id');
    });
  }.property('id','state').volatile(),

  combinedState: function() {
    var service = this.get('state');
    var health = this.get('healthState');

    if ( ['active','updating-active'].indexOf(service) === -1 )
    {
      // If the service isn't active, return its state
      return service;
    }

    if ( health === 'healthy' )
    {
      return service;
    }
    else
    {
      return health;
    }
  }.property('state', 'healthState'),

  isGlobalScale: function() {
    return (this.get('launchConfig.labels')||{})[C.LABEL.SCHED_GLOBAL] + '' === 'true';
  }.property('launchConfig.labels'),

  canScale: function() {
    if ( ['service','networkdriverservice','storagedriverservice','loadbalancerservice'].includes(this.get('type').toLowerCase()) )
    {
      return !this.get('isGlobalScale');
    }
    else
    {
      return false;
    }
  }.property('type'),

  hasContainers: function() {
    return [
      'service',
      'networkdriverservice',
      'storagedriverservice',
      'loadbalancerservice',
      'kubernetesservice',
      'composeservice',
    ].includes(this.get('type').toLowerCase());
  }.property('type'),

  isReal: function() {
    return [
      'service',
      'networkdriverservice',
      'storagedriverservice',
      'loadbalancerservice',
    ].includes(this.get('type').toLowerCase());
  }.property('type'),

  hasPorts: Ember.computed.alias('isReal'),
  hasImage: Ember.computed.alias('isReal'),
  hasLabels: Ember.computed.alias('isReal'),
  canUpgrade: Ember.computed.alias('isReal'),

  isK8s: function() {
    return ['kubernetesservice'].indexOf(this.get('type').toLowerCase()) >= 0;
  }.property('type'),

  isSwarm: function() {
    return ['composeservice'].indexOf(this.get('type').toLowerCase()) >= 0;
  }.property('type'),

  displayType: function() {
    var out;
    switch ( this.get('type').toLowerCase() )
    {
      case 'loadbalancerservice': out = 'Load Balancer'; break;
      case 'dnsservice':          out = 'Service Alias'; break;
      case 'externalservice':     out = 'External'; break;
      case 'kubernetesservice':   out = 'K8s Service'; break;
      case 'composeservice':      out = 'Compose Service'; break;
      case 'networkdriverservice':out = 'Network Service'; break;
      case 'storagedriverservice':out = 'Storage Service'; break;
      default:                    out = 'Service'; break;
    }

    return out;
  }.property('type'),

  hasSidekicks: function() {
    return this.get('secondaryLaunchConfigs.length') > 0;
  }.property('secondaryLaunchConfigs.length'),

  displayDetail: function() {
    let translation = this.get('intl').findTranslationByKey('generic.image');
    translation = this.get('intl').formatMessage(translation);
      return ('<label>'+ translation +': </label><span>' + (this.get('launchConfig.imageUuid')||'').replace(/^docker:/,'') + '</span>').htmlSafe();
  }.property('launchConfig.imageUuid', 'intl._locale'),


  activeIcon: function() {
    return activeIcon(this);
  }.property('type'),

  endpointsMap: function() {
    var out = {};
    (this.get('publicEndpoints')||[]).forEach((endpoint) => {
      if ( !endpoint.port )
      {
        // Skip nulls
        return;
      }

      if ( out[endpoint.port] )
      {
        out[endpoint.port].push(endpoint.ipAddress);
      }
      else
      {
        out[endpoint.port] = [endpoint.ipAddress];
      }
    });

    return out;
  }.property('publicEndpoints.@each.{ipAddress,port}'),

  endpointsByPort: function() {
    var out = [];
    var map = this.get('endpointsMap');
    Object.keys(map).forEach((key) => {
      out.push({
        port: parseInt(key,10),
        ipAddresses: map[key]
      });
    });

    return out;
  }.property('endpointsMap'),

  displayPorts: function() {
    var pub = '';

    this.get('endpointsByPort').forEach((obj) => {
      var url = Util.constructUrl(false, obj.ipAddresses[0], obj.port);
      pub += '<span>' +
        '<a href="'+ url +'" target="_blank">' +
          obj.port +
        '</a>,' +
      '</span> ';
    });

    // Remove last comma
    pub = pub.replace(/,([^,]*)$/,'$1');


    if ( pub )
    {
      let out = this.get('intl').findTranslationByKey('generic.ports');
      out = this.get('intl').formatMessage(out);
      return ('<label>'+out+': </label>' + pub).htmlSafe();
    }
    else
    {
      return '';
    }
  }.property('endpointsByPort.@each.{port,ipAddresses}', 'intl._locale'),


});

export function activeIcon(service)
{
  var out = 'icon icon-services';
  switch ( service.get('type').toLowerCase() )
  {
    case 'loadbalancerservice': out = 'icon icon-fork';    break;
    case 'dnsservice':          out = 'icon icon-compass'; break;
    case 'externalservice':     out = 'icon icon-cloud';   break;
    case 'kubernetesservice':   out = 'icon icon-kubernetes'; break;
    case 'composeservice':      out = 'icon icon-docker'; break;
  }

  return out;
}

Service.reopenClass({
  stateMap: {
    'active':             {icon: activeIcon,                  color: 'text-success'},
    'canceled-rollback':  {icon: 'icon icon-life-ring',       color: 'text-info'},
    'canceled-upgrade':   {icon: 'icon icon-life-ring',       color: 'text-info'},
    'canceling-rollback': {icon: 'icon icon-life-ring',       color: 'text-info'},
    'canceling-upgrade':  {icon: 'icon icon-life-ring',       color: 'text-info'},
    'finishing-upgrade':  {icon: 'icon icon-arrow-circle-up', color: 'text-info'},
    'rolling-back':       {icon: 'icon icon-history',         color: 'text-info'},
    'upgraded':           {icon: 'icon icon-arrow-circle-up', color: 'text-info'},
    'upgrading':          {icon: 'icon icon-arrow-circle-up', color: 'text-info'},
  }
});

export default Service;
