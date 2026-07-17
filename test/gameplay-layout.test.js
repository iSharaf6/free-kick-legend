import assert from 'node:assert/strict';
import test from 'node:test';

import { BALL_R, CAM, GAME_H, GAME_W, GOAL_H, GOAL_W, WALL_DIST, project } from '../src/config.js';
import {
  GAMEPLAY_LAYOUT, REFERENCE_VIEWPORT, perspectiveScale, pixelSafeSize, screenX, screenY
} from '../src/gameplayLayout.js';
import { WALL_SPACING } from '../src/objects/Wall.js';

const viewportScale = REFERENCE_VIEWPORT.height / GAME_H;
const canvasWidth = GAME_W * viewportScale;
const canvasLeft = (REFERENCE_VIEWPORT.width - canvasWidth) / 2;
const px = (logical) => logical * viewportScale;

test('reference HUD and objective panel stay within the supplied pixel targets', () => {
  assert.ok(px(screenY(GAMEPLAY_LAYOUT.header.height)) >= 88);
  assert.ok(px(screenY(GAMEPLAY_LAYOUT.header.height)) <= 96);

  const objectiveWidth = px(pixelSafeSize(screenX(GAMEPLAY_LAYOUT.objective.width)));
  const objectiveHeight = px(pixelSafeSize(screenY(GAMEPLAY_LAYOUT.objective.height)));
  const objectiveBottom = px(screenY(GAMEPLAY_LAYOUT.objective.bottom));
  assert.ok(objectiveWidth >= 980 && objectiveWidth <= 1030);
  assert.ok(objectiveHeight >= 60 && objectiveHeight <= 64);
  assert.ok(objectiveBottom >= 20 && objectiveBottom <= 28);
});

test('academy lift-off composition matches the 1664 by 926 proportion targets', () => {
  const distance = 15;
  const zGoal = CAM.ballDist + distance;
  const zWall = CAM.ballDist + Math.min(WALL_DIST, distance * GAMEPLAY_LAYOUT.wall.distanceRatio);
  const goalScale = CAM.focal / zGoal;
  const goalWidth = px(GOAL_W * goalScale);
  const goalHeight = px(GOAL_H * goalScale);
  const goalCentreX = canvasLeft + px(project(0, 0, zGoal).x);
  const goalGroundY = px(project(0, 0, zGoal).y);
  const wallBaselineY = px(project(0, 0, zWall).y);
  const ball = project(0, BALL_R, CAM.ballDist);
  const ballCentreY = px(ball.y);

  assert.ok(goalCentreX >= 830 && goalCentreX <= 834);
  assert.ok(goalWidth >= 500 && goalWidth <= 530);
  assert.ok(goalHeight >= 175 && goalHeight <= 190);
  assert.ok(goalGroundY >= 444 && goalGroundY <= 454);
  assert.ok(wallBaselineY >= 493 && wallBaselineY <= 503);
  assert.ok(ballCentreY >= 718 && ballCentreY <= 730);

  const textureDiameter = pixelSafeSize(ball.s * BALL_R * 2 * GAMEPLAY_LAYOUT.ball.visualScale, 4);
  const visibleBallDiameter = px(textureDiameter * (41 / 57));
  assert.ok(visibleBallDiameter >= 42 && visibleBallDiameter <= 48);
});

test('one perspective curve gives the kicker, wall and crowd a coherent hierarchy', () => {
  const distance = 15;
  const zGoal = CAM.ballDist + distance;
  const zWall = CAM.ballDist + Math.min(WALL_DIST, distance * GAMEPLAY_LAYOUT.wall.distanceRatio);
  const ball = project(0, BALL_R, CAM.ballDist);
  const kickerBaseline = ball.y + screenY(GAMEPLAY_LAYOUT.kicker.offsetY);
  const wallBaseline = project(0, 0, zWall).y;
  const crowdBaseline = project(0, 0, zGoal + 3.2).y;

  assert.ok(perspectiveScale(kickerBaseline) >= 0.98);
  assert.ok(perspectiveScale(wallBaseline) >= 0.66 && perspectiveScale(wallBaseline) <= 0.70);
  assert.ok(perspectiveScale(crowdBaseline) >= 0.50 && perspectiveScale(crowdBaseline) <= 0.55);

  const kickerHeight = px(GAMEPLAY_LAYOUT.kicker.textureBoxHeight * (240 / 256));
  const wallHeightLogical = GAMEPLAY_LAYOUT.character.foregroundOpaqueHeight * perspectiveScale(wallBaseline);
  const wallHeight = px(wallHeightLogical);
  assert.ok(kickerHeight >= 155 && kickerHeight <= 170);
  assert.ok(wallHeight >= 105 && wallHeight <= 120);

  const wallPlayerWidth = wallHeightLogical * (61 / 188);
  const wallSpan = 3 * WALL_SPACING * (CAM.focal / zWall) + wallPlayerWidth;
  const goalSpan = GOAL_W * (CAM.focal / zGoal);
  assert.ok(wallSpan / goalSpan >= 0.35 && wallSpan / goalSpan <= 0.40);
});
