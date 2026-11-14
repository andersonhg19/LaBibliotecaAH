jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// useToast is consumed by most screens. Stub it globally so component/screen
// tests don't need to wrap everything in a ToastProvider. ToastProvider itself
// is kept real (requireActual); the provider's own logic is exercised by its
// dedicated unit test, which unmocks this module.
globalThis.__mockShowToast = jest.fn();
globalThis.__mockHideToast = jest.fn();
jest.mock('./src/contexts/ToastContext', () => {
  const actual = jest.requireActual('./src/contexts/ToastContext');
  return {
    __esModule: true,
    ...actual,
    useToast: () => ({
      toasts: [],
      showToast: globalThis.__mockShowToast,
      hideToast: globalThis.__mockHideToast,
    }),
  };
});

// Silencia warnings INOFENSIVOS de consola en tests (animaciones que actualizan
// estado tras el render -> "not wrapped in act"). No afectan los asserts; jest
// sigue reportando fallos reales por su cuenta. Cualquier otro error se imprime.
const __IGNORED_LOGS = [
  'not wrapped in act',
  'Animated:',
  'useNativeDriver',
];
const __origError = console.error;
const __origWarn = console.warn;
const __shouldIgnore = (args) =>
  typeof args[0] === 'string' && __IGNORED_LOGS.some((p) => args[0].includes(p));
console.error = (...args) => { if (!__shouldIgnore(args)) __origError(...args); };
console.warn = (...args) => { if (!__shouldIgnore(args)) __origWarn(...args); };
