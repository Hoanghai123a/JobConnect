/**
 * Stub file for staff-export-server - staff functionality removed
 */

/**
 * Stub: Returns empty buffer
 */
export async function generateStaffExportExcel(data: any): Promise<Buffer> {
  return Buffer.from([]);
}

/**
 * Stub: Does nothing
 */
export async function exportStaffData(options: any): Promise<Buffer> {
  return Buffer.from([]);
}

/**
 * Stub: Returns 404 response
 */
export async function handleStaffExcelExport(request: Request): Promise<Response> {
  return new Response(JSON.stringify({ message: "Staff export functionality removed" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}
