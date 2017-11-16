import { alias } from '@ember/object/computed';
import { inject as service } from '@ember/service';
import Controller, { inject as controller } from '@ember/controller';
import { searchFields as containerSearchFields } from 'shared/components/container-dots/component';
import { headers } from 'ui/containers/index/controller';

export default Controller.extend({
  projectController: controller('authenticated.project'),
  scope:             service(),

  tags:              alias('projectController.tags'),
  simpleMode:        alias('projectController.simpleMode'),
  group:             alias('projectController.group'),
  groupTableBy:      alias('projectController.groupTableBy'),
  showStack:         alias('projectController.showStack'),
  expandedInstances: alias('projectController.expandedInstances'),
  preSorts:          alias('projectController.preSorts'),

  queryParams:       ['sortBy'],
  sortBy:            'name',

  actions: {
    toggleExpand() {
      this.get('projectController').send('toggleExpand', ...arguments);
    },
  },

  extraSearchFields: ['id:prefix','displayIp:ip'],
  extraSearchSubFields: containerSearchFields,
  headers: headers,

  rows: function() {
    let showStack = this.get('showStack');
    let services = this.get('model.services').filter((obj) => {
      return showStack[obj.get('stackId')] && obj.get('isBalancer');
    });

    if ( this.get('group') === 'none' ) {
      let out = []
      services.forEach((obj) => {
        out.pushObjects(obj.get('instances'));
      });

      return out;
    } else {
      return services;
    }
  }.property('group','showStack','model.services.@each.{isBalancer,instances}'),
});
