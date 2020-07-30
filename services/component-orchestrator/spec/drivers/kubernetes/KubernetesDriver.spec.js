const KubernetesDriver = require('../../../src/drivers/kubernetes/KubernetesDriver');
const FlowSecret = require('../../../src/drivers/kubernetes/Secret');
const KubernetesRunningFlowNode = require('../../../src/drivers/kubernetes/KubernetesRunningFlowNode');
const sinon = require('sinon');
const chai = require('chai');
chai.use(require('sinon-chai'));
const { expect } = chai;

describe('KubernetesDriver', () => {
    let driver;
    let coreClient;
    let appsClient;

    beforeEach(() => {
        const config = {
            NAMESPACE: 'flows-ns',
            DEFAULT_CPU_LIMIT: '0.1',
            DEFAULT_MEM_LIMIT: '512',
            DEFAULT_CPU_REQUEST: '0.1',
            DEFAULT_MEM_REQUEST: '256',
            get(key) {
                return this[key];
            }
        };
        const logger = {
            trace: () => {},
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {}
        };

        coreClient = {

        };

        appsClient = {
            deployments: {
                post: () => {}
            }
        };

        const k8s = {
            getCoreClient: () => coreClient,
            getAppsClient: () => appsClient
        };

        sinon.stub(appsClient.deployments, 'post').resolves();

        driver = new KubernetesDriver({config, logger, k8s});
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('#createApp', () => {
        it('should deploy a new app into K8s', async () => {
            const flowSecret = new FlowSecret();
            sinon.stub(driver, '_prepareEnvVars').returns({container: 'env-vars'});
            sinon.stub(driver, '_ensureSecret').resolves(flowSecret);
            sinon.stub(driver, '_createRunningFlowNode').resolves();

            const flow = {id: 'flow1'};
            const node = {id: 'node1'};
            const envVars = {env: 'lololo'};
            await driver.createApp(flow, node, envVars);

            expect(driver._prepareEnvVars).to.have.been.calledOnceWith(flow, node, envVars);
            expect(driver._ensureSecret).to.have.been.calledOnceWith(
                flow,
                node,
                {container: 'env-vars'}
            );
            expect(driver._createRunningFlowNode).to.have.been.calledOnceWith(flow, node, flowSecret);
        });
    });

    describe('#_createRunningFlowNode', () => {
        it('should create RunningFlowNode instance', async () => {
            sinon.stub(driver, '_generateAppDefinition').returns({kind: 'Job'});
            appsClient.deployments.post.resolves({
                body: {
                    kind: 'Deployment',
                    metadata: {
                        name: 'new-deployment'
                    }
                }
            });

            const flow = {id: 'flow1'};
            const node = {id: 'node1'};
            const flowNodeSecret = {id: 'flow-secret'};
            const result = await driver._createRunningFlowNode(flow, node, flowNodeSecret, {});
            expect(result instanceof KubernetesRunningFlowNode).to.be.true;
            expect(result.name).to.equal('new-deployment');
        });
    });

    describe('#_generateAppDefinition', () => {
        it('should generate app descriptor', async () => {
            const flow = {
                id: 'flow1'
            };
            const node = {
                id: 'step1',
                componentId: '123',
                'function': 'testAction'
            };
            const secret = {
                metadata: {
                    name: 'my-secret'
                }
            };
            const component = {
                id: 'comp1',
                distribution: {
                    type: 'docker',
                    image: 'openintegrationhub/email'
                }
            };

            const result = await driver._generateAppDefinition(flow, node, secret, component, {});

            expect(result).to.deep.equal({
                'apiVersion': 'apps/v1',
                'kind': 'Deployment',
                'metadata': {
                    'annotations': {
                        'flowId': 'flow1',
                        'nodeId': 'step1',
                        'stepId': 'step1'
                    },
                    'name': 'flow1step1',
                    'namespace': 'flows-ns'
                },
                'spec': {
                   'replicas': 1,
                    'selector': {
                        'matchLabels': {
                            'flowId': 'flow1',
                            'stepId': 'step1'
                    }
                    },
                    'template': {
                        'metadata': {
                            'labels': {
                                'flowId': 'flow1',
                                'stepId': 'step1'
                            },
                            'annotations': {
                                'flowId': 'flow1',
                                'stepId': 'step1',
                            },
                        },
                        'spec': {
                            'containers': [
                                {
                                    'envFrom': [
                                        {
                                            'secretRef': {
                                                'name': 'my-secret'
                                            }
                                        }
                                    ],
                                    'image': 'openintegrationhub/email',
                                    'imagePullPolicy': 'Always',
                                    'name': 'apprunner',
                                    'resources': {
                                        'limits': {
                                            'cpu': '0.1',
                                            'memory': '512'
                                        },
                                        'requests': {
                                            'cpu': '0.1',
                                            'memory': '256'
                                        }
                                    }
                                }
                            ],
                        }
                    }
                }
            });
        });
    });
});
