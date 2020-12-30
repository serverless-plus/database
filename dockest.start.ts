import { Dockest, logLevel, sleepWithLog } from 'dockest';

const { run } = new Dockest({
  composeFile: 'docker-compose.yml',
  dumpErrors: true,
  jestLib: require('jest'),
  logLevel: logLevel.DEBUG,
});

const services = [
  {
    serviceName: 'mysql',
    readinessCheck: () => sleepWithLog(15, 'Sleepidy sleep'),
  },
];

run(services);
