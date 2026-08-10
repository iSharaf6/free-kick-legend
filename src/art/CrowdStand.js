import { CROWD_ANIMATION, crowdClip } from '../data/crowdAnimation.js';
import {
  CrowdAnimationController,
  registerCrowdAnimations
} from '../systems/CrowdAnimationController.js';
import { addStandDressing } from './StandDressing.js';

export { CrowdAnimationController, registerCrowdAnimations };

/**
 * Build one authored, full-width crowd plate and keep its transform immutable.
 * Animation changes texture frames only: x, y, scale and the stand dressing do
 * not move between ambient, goal, and ball-out states.
 */
export function addCrowdStand(scene, {
  viewWidth = CROWD_ANIMATION.displayWidth,
  reducedMotion = false,
  depthOffset = 0,
  dressed = true,
  autoStart = true
} = {}) {
  registerCrowdAnimations(scene);
  const moving = crowdClip('moving');
  const scale = CROWD_ANIMATION.displayScale * (viewWidth / CROWD_ANIMATION.displayWidth);
  const sprite = scene.textures?.exists?.(moving.textureKey)
    ? scene.add.sprite(0, 0, moving.textureKey, 0)
      .setOrigin(0, 0)
      // One uniform scale, written once. No state transition changes it.
      .setScale(scale)
      .setDepth(CROWD_ANIMATION.depth + depthOffset)
    : null;

  const dressing = dressed
    ? addStandDressing(scene, { viewWidth, reducedMotion, depthOffset })
    : null;
  const controller = new CrowdAnimationController(
    scene,
    sprite,
    dressing,
    { reducedMotion }
  );
  if (autoStart) controller.startAmbient();
  return controller;
}

export function addMenuCrowd(scene, { depth = 2, reducedMotion = false } = {}) {
  return addCrowdStand(scene, {
    reducedMotion,
    depthOffset: depth - CROWD_ANIMATION.depth
  });
}
