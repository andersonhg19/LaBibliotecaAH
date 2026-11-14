// Con la CPU repartida (jest en paralelo en casa/CI), 1 s por defecto de waitFor/findBy no basta (auditoria OP-06).
// Va en setupFilesAfterEnv porque necesita `expect` ya definido.
require('@testing-library/react-native').configure({ asyncUtilTimeout: 5000 });
