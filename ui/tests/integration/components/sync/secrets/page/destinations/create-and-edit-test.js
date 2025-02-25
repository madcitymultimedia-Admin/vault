/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: BUSL-1.1
 */

import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { setupEngine } from 'ember-engines/test-support';
import { setupMirage } from 'ember-cli-mirage/test-support';
import hbs from 'htmlbars-inline-precompile';
import sinon from 'sinon';
import { Response } from 'miragejs';
import { click, render, typeIn } from '@ember/test-helpers';
import { PAGE } from 'vault/tests/helpers/sync/sync-selectors';
import { syncDestinations } from 'vault/helpers/sync-destinations';
import { decamelize, underscore } from '@ember/string';

const SYNC_DESTINATIONS = syncDestinations();
module('Integration | Component | sync | Secrets::Page::Destinations::CreateAndEdit', function (hooks) {
  setupRenderingTest(hooks);
  setupEngine(hooks, 'sync');
  setupMirage(hooks);

  hooks.beforeEach(function () {
    this.store = this.owner.lookup('service:store');
    this.transitionStub = sinon.stub(this.owner.lookup('service:router'), 'transitionTo');
    this.clearDatasetStub = sinon.stub(this.store, 'clearDataset');

    this.renderFormComponent = () => {
      return render(hbs` <Secrets::Page::Destinations::CreateAndEdit @destination={{this.model}} />`, {
        owner: this.engine,
      });
    };
  });

  test('create: it renders and navigates back to create on cancel', async function (assert) {
    assert.expect(2);
    const { type } = SYNC_DESTINATIONS[0];
    this.model = this.store.createRecord(`sync/destinations/${type}`, { type });

    await this.renderFormComponent();
    assert.dom(PAGE.breadcrumbs).hasText('Secrets Sync Select Destination Create Destination');
    await click(PAGE.cancelButton);
    const transition = this.transitionStub.calledWith('vault.cluster.sync.secrets.destinations.create');
    assert.true(transition, 'transitions to vault.cluster.sync.secrets.destinations.create on cancel');
  });

  test('edit: it renders and navigates back to details on cancel', async function (assert) {
    assert.expect(4);
    const type = SYNC_DESTINATIONS[0].type;
    const data = this.server.create('sync-destination', type);
    const id = `${type}/${data.name}`;
    data.id = id;
    this.store.pushPayload(`sync/destinations/${type}`, {
      modelName: `sync/destinations/${type}`,
      ...data,
    });
    this.model = this.store.peekRecord(`sync/destinations/${type}`, id);

    await this.renderFormComponent();
    assert.dom(PAGE.breadcrumbs).hasText('Secrets Sync Destination Edit Destination');
    assert.dom('h2').hasText('Credentials', 'renders credentials section on edit');
    assert
      .dom('p.hds-foreground-faint')
      .hasText(
        'Connection credentials are sensitive information and the value cannot be read. Enable the input to update.'
      );
    await click(PAGE.cancelButton);
    const transition = this.transitionStub.calledWith('vault.cluster.sync.secrets.destinations.destination');
    assert.true(transition, 'transitions to vault.cluster.sync.secrets.destinations.destination on cancel');
  });

  test('it renders API errors', async function (assert) {
    assert.expect(1);
    const name = 'my-failed-dest';
    const type = SYNC_DESTINATIONS[0].type;
    this.server.post(`sys/sync/destinations/${type}/${name}`, () => {
      return new Response(
        500,
        {},
        {
          errors: [
            `1 error occurred: * couldn't create store node in syncer: failed to create store: unable to initialize store of type "azure-kv": failed to parse azure key vault URI: parse "my-unprasableuri": invalid URI for request`,
          ],
        }
      );
    });

    this.model = this.store.createRecord(`sync/destinations/${type}`, { name, type });
    await this.renderFormComponent();

    await click(PAGE.saveButton);
    assert
      .dom(PAGE.messageError)
      .hasText(
        `Error 1 error occurred: * couldn't create store node in syncer: failed to create store: unable to initialize store of type "azure-kv": failed to parse azure key vault URI: parse "my-unprasableuri": invalid URI for request`
      );
  });

  test('it renders warning validation only when editing vercel-project team_id', async function (assert) {
    assert.expect(2);
    const type = 'vercel-project';
    // new model
    this.model = this.store.createRecord(`sync/destinations/${type}`, { type });
    await this.renderFormComponent();
    await typeIn(PAGE.inputByAttr('teamId'), 'id');
    assert
      .dom(PAGE.validationWarning('teamId'))
      .doesNotExist('does not render warning validation for new vercel-project destination');

    // existing model
    const data = this.server.create('sync-destination', type);
    const id = `${type}/${data.name}`;
    data.id = id;
    this.store.pushPayload(`sync/destinations/${type}`, {
      modelName: `sync/destinations/${type}`,
      ...data,
    });
    this.model = this.store.peekRecord(`sync/destinations/${type}`, id);
    await this.renderFormComponent();
    await PAGE.form.fillInByAttr('teamId', '');
    await typeIn(PAGE.inputByAttr('teamId'), 'edit');
    assert
      .dom(PAGE.validationWarning('teamId'))
      .hasText(
        'Team ID should only be updated if the project was transferred to another account.',
        'it renders validation warning'
      );
  });

  // CREATE FORM ASSERTIONS FOR EACH DESTINATION TYPE
  for (const destination of SYNC_DESTINATIONS) {
    const { name, type } = destination;

    module(`create destination: ${type}`, function (hooks) {
      hooks.beforeEach(function () {
        this.model = this.store.createRecord(`sync/destinations/${type}`, { type });
      });

      test('it renders destination form', async function (assert) {
        assert.expect(this.model.formFields.length + 1);

        await this.renderFormComponent();

        assert.dom(PAGE.title).hasTextContaining(`Create Destination for ${name}`);
        for (const attr of this.model.formFields) {
          assert.dom(PAGE.inputByAttr(attr.name)).exists();
        }
      });

      test('it saves destination and transitions to details', async function (assert) {
        assert.expect(5);
        const name = 'my-name';
        this.server.post(`sys/sync/destinations/${type}/${name}`, (schema, req) => {
          const payload = JSON.parse(req.requestBody);
          assert.ok(true, `makes request: POST sys/sync/destinations/${type}/${name}`);
          assert.notPropContains(payload, { name: 'my-name', type }, 'name and type do not exist in payload');

          // instead of looping through all attrs, just grab the second one (first is 'name')
          const testAttr = this.model.formFields[1].name;
          assert.propContains(
            payload,
            { [underscore(testAttr)]: `my-${testAttr}` },
            'payload contains expected attrs'
          );
          return payload;
        });

        await this.renderFormComponent();

        for (const attr of this.model.formFields) {
          await PAGE.form.fillInByAttr(attr.name, `my-${attr.name}`);
        }
        await click(PAGE.saveButton);
        const actualArgs = this.transitionStub.lastCall.args;
        const expectedArgs = ['vault.cluster.sync.secrets.destinations.destination.details', type, name];
        assert.propEqual(actualArgs, expectedArgs, 'transitionTo called with expected args');
        assert.propEqual(
          this.clearDatasetStub.lastCall.args,
          ['sync/destination'],
          'Store dataset is cleared on create success'
        );
      });

      test('it validates inputs', async function (assert) {
        const warningValidations = ['teamId'];
        const validationAssertions = this.model._validations;
        // remove warning validations to
        warningValidations.forEach((warning) => {
          delete validationAssertions[warning];
        });
        assert.expect(Object.keys(validationAssertions).length);

        await this.renderFormComponent();

        await click(PAGE.saveButton);

        // only asserts validations for presence, refactor if validations change
        for (const attr in validationAssertions) {
          const { message } = validationAssertions[attr].find((v) => v.type === 'presence');
          assert.dom(PAGE.validation(attr)).hasText(message, `renders validation: ${message}`);
        }
      });
    });
  }

  // EDIT FORM ASSERTIONS FOR EACH DESTINATION TYPE
  const EDITABLE_FIELDS = {
    'aws-sm': ['accessKeyId', 'secretAccessKey'],
    'azure-kv': ['clientId', 'clientSecret'],
    'gcp-sm': ['credentials'],
    gh: ['accessToken'],
    'vercel-project': ['accessToken', 'teamId', 'deploymentEnvironments'],
  };
  for (const destination of SYNC_DESTINATIONS) {
    const { type, maskedParams } = destination;
    module(`edit destination: ${type}`, function (hooks) {
      hooks.beforeEach(function () {
        this.data = this.server.create('sync-destination', type);
        const id = `${type}/${this.data.name}`;
        this.data.id = id;
        this.store.pushPayload(`sync/destinations/${type}`, {
          modelName: `sync/destinations/${type}`,
          ...this.data,
        });
        this.model = this.store.peekRecord(`sync/destinations/${type}`, id);
      });

      test('it renders destination form and PATCH updates a destination', async function (assert) {
        const disabledAssertions = this.model.formFields.filter((f) => f.options.editDisabled).length;
        const editable = EDITABLE_FIELDS[this.model.type];
        assert.expect(5 + disabledAssertions + editable.length);
        this.server.patch(`sys/sync/destinations/${type}/${this.data.name}`, (schema, req) => {
          assert.ok(true, `makes request: PATCH sys/sync/destinations/${type}/${this.data.name}`);
          const payload = JSON.parse(req.requestBody);
          const payloadKeys = Object.keys(payload);
          const expectedKeys = editable.map((k) => decamelize(k));
          assert.propEqual(payloadKeys, expectedKeys, `${type} payload only contains editable attrs`);
          expectedKeys.forEach((key) => {
            // deploymentEnvironment field fixed possible options
            const expectedValue = key === 'deployment_environments' ? 'production' : `new-${key}-value`;
            assert.strictEqual(payload[key], expectedValue, `destination: ${type} updates key: ${key}`);
          });
          return { payload };
        });

        await this.renderFormComponent();
        assert.dom(PAGE.title).hasTextContaining(`Edit ${this.model.name}`);

        for (const attr of this.model.formFields) {
          // Enable inputs with sensitive values
          if (maskedParams.includes(attr.name)) {
            await click(PAGE.form.enableInput(attr.name));
          }
          if (editable.includes(attr.name)) {
            await PAGE.form.fillInByAttr(attr.name, `new-${decamelize(attr.name)}-value`);
          } else {
            assert.dom(PAGE.inputByAttr(attr.name)).isDisabled(`${attr.name} is disabled`);
          }
        }

        await click(PAGE.saveButton);
        const actualArgs = this.transitionStub.lastCall.args;
        const expectedArgs = [
          'vault.cluster.sync.secrets.destinations.destination.details',
          type,
          this.data.name,
        ];
        assert.propEqual(actualArgs, expectedArgs, 'transitionTo called with expected args');
        assert.propEqual(
          this.clearDatasetStub.lastCall.args,
          ['sync/destination'],
          'Store dataset is cleared on create success'
        );
      });
    });
  }
});
