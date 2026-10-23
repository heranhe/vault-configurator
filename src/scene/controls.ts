import type CameraControlsImpl from 'camera-controls';

/** CameraControls 实例的共享引用：单元按下时需要同步禁用相机旋转，React 状态来不及 */
export const controls: { current: CameraControlsImpl | null } = { current: null };
