/**
 * Web version of upload-part.ts. In the browser the pickers return blob: or data: URLs,
 * which fetch can read back into a Blob.
 */
export async function appendFile(form: FormData, file: { uri: string; name: string; mimeType: string }): Promise<void> {
  const blob = await (await fetch(file.uri)).blob();
  form.append('file', new Blob([blob], { type: file.mimeType || blob.type }), file.name);
}
