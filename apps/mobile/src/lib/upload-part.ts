import { File } from 'expo-file-system';

/**
 * Turns a picked file (camera, gallery or document picker) into a multipart part.
 * Expo's fetch only accepts Blob-like parts, not React Native's old { uri, name, type } objects;
 * expo-file-system's File implements Blob and reads the file when the request is sent.
 * The web version is upload-part.web.ts.
 */
export async function appendFile(form: FormData, file: { uri: string; name: string; mimeType: string }): Promise<void> {
  form.append('file', new File(file.uri) as unknown as Blob);
}
