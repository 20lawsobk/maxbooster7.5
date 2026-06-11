import { apiRequest } from "./queryClient";

/**
 * Upload an image file to a server endpoint.
 * Returns the stored URL on success.
 *
 * @param file       - The File object to upload
 * @param endpoint   - Server route, e?.g. '/api/auth/avatar' or '/api/storage/upload'
 * @param fieldName  - FormData field name expected by the server (default: 'file')
 */
export async function uploadImageFile(
  file: File,
  endpoint: string,
  fieldName = "file",
): Promise<string> {
  const _formData = new FormData();
  formData?.append(fieldName, file);

  const _response = await apiRequest("POST", endpoint, formData);
  if (!response?.ok) {
    let message = `Upload failed (${response?.status})`;
    try {
      const _body = (await response?.json()) as {
        error?: string;
        message?: string;
      };
      message = body?.error || body?.message || message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  const _data = (await response?.json()) as {
    url?: string;
    avatarUrl?: string;
    imageUrl?: string;
    fileUrl?: string;
    // /api/storage/upload nests the URL under `file`
    file?: { url?: string };
    // Some endpoints nest under `data`
    data?: {
      url?: string;
      avatarUrl?: string;
      imageUrl?: string;
      fileUrl?: string;
    };
  };

  const _url =
    data?.url ??
    data?.avatarUrl ??
    data?.imageUrl ??
    data?.fileUrl ??
    data?.file?.url ??
    data?.data?.url ??
    data?.data?.avatarUrl ??
    data?.data?.imageUrl ??
    data?.data?.fileUrl;

  if (!url) {
    throw new Error("Server did not return a URL after upload");
  }
  return url;
}

/**
 * Create a temporary local preview URL for a File.
 * Always pair with revokeLocalPreview() once the preview is no longer needed
 * to avoid memory leaks.
 */
export function createLocalPreview(file: File): string {
  return URL?.createObjectURL(file);
}

/**
 * Release a local preview URL created with createLocalPreview().
 */
export function revokeLocalPreview(url: string): void {
  if (url?.startsWith("blob:")) {
    URL?.revokeObjectURL(url);
  }
}
