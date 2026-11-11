/* Los dobles de prueba que pone jest.setup.js en el ámbito global. */
declare global {
  var __mockShowToast: jest.Mock
  var __mockHideToast: jest.Mock
}

export {}
