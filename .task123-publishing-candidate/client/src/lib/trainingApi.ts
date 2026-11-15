import { apiRequest } from "./queryClient";

export type TrainingApiRequest = typeof apiRequest;

export function createTrainingApiFetch(request: TrainingApiRequest = apiRequest) {
  return async (
    url: string,
    options: { method?: string; body?: string } = {},
  ) => {
    const method = options.method ?? "GET";
    const data =
      options.body === undefined ? undefined : JSON.parse(options.body);
    const response = await request(method, url, data);
    return response.json();
  };
}

export const trainingApiFetch = createTrainingApiFetch();
