import { RetryProvider } from "./retry";

export function App() {
  return <RetryProvider maxAttempts={4}>opening animation timeline</RetryProvider>;
}
