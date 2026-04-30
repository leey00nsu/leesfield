const clientShellHydratedKey = "__leesfieldClientShellHydrated";

type LeesfieldWindow = Window & {
  [clientShellHydratedKey]?: boolean;
};

function getLeesfieldWindow() {
  if (typeof window === "undefined") {
    return null;
  }

  return window as LeesfieldWindow;
}

export function hasClientShellHydrated() {
  return Boolean(getLeesfieldWindow()?.[clientShellHydratedKey]);
}

export function markClientShellHydrated() {
  const currentWindow = getLeesfieldWindow();
  if (!currentWindow) {
    return;
  }

  currentWindow[clientShellHydratedKey] = true;
}

export function resetClientShellHydrationForTests() {
  const currentWindow = getLeesfieldWindow();
  if (!currentWindow) {
    return;
  }

  delete currentWindow[clientShellHydratedKey];
}
