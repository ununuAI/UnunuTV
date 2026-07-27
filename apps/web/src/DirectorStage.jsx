import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls, PerspectiveCamera } from "@react-three/drei";

const DEFAULT_STAGE = {
  camera: { position: [5, 4, 7], focalLength: 35 },
  subjects: [
    { id: "actor-a", position: [-1.4, 0.9, 0], color: "#ff6b45" },
    { id: "actor-b", position: [1.2, 0.9, -0.6], color: "#47a7ff" }
  ],
  lights: [{ position: [2, 6, 4], intensity: 2.5 }]
};

export function normalizedStage(stage) {
  return {
    ...DEFAULT_STAGE,
    ...stage,
    camera: { ...DEFAULT_STAGE.camera, ...stage?.camera },
    subjects: Array.isArray(stage?.subjects) ? stage.subjects : DEFAULT_STAGE.subjects,
    lights: Array.isArray(stage?.lights) ? stage.lights : DEFAULT_STAGE.lights
  };
}

export function DirectorStage({ stage }) {
  const model = normalizedStage(stage);
  return (
    <div className="director-viewport">
      <Canvas shadows>
        <color attach="background" args={["#101319"]} />
        <PerspectiveCamera makeDefault position={model.camera.position} fov={50} />
        <ambientLight intensity={0.45} />
        {model.lights.map((light, index) => (
          <pointLight key={index} castShadow position={light.position} intensity={light.intensity ?? 2} color={light.color || "white"} />
        ))}
        {model.subjects.map((subject) => (
          <mesh key={subject.id} castShadow position={subject.position || [0, 0.9, 0]}>
            <capsuleGeometry args={[0.38, 1.1, 8, 16]} />
            <meshStandardMaterial color={subject.color || "#ff6b45"} roughness={0.55} />
          </mesh>
        ))}
        <Grid infiniteGrid fadeDistance={28} cellColor="#303844" sectionColor="#55616f" />
        <OrbitControls makeDefault />
      </Canvas>
      <span className="viewport-badge">3D BLOCKING · ORBIT ENABLED</span>
    </div>
  );
}

export { DEFAULT_STAGE };
