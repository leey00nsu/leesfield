/** Measure the completed visual layout, not a frame of the opening animation. */
export async function settledBounds(element: Element) {
  await Promise.all(element.getAnimations().map(animation => animation.finished));
  return element.getBoundingClientRect();
}
