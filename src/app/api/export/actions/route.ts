import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import ExcelJS from 'exceljs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const workstream = searchParams.get('workstream');
    const priority = searchParams.get('priority');
    const format = searchParams.get('format') || 'xlsx';

    const supabase = await createClient();

    // Build query
    let query = supabase
      .from('actions')
      .select(`
        *,
        owner:users!actions_owner_id_fkey(full_name),
        workstream:workstreams(name),
        creator:users!actions_created_by_fkey(full_name)
      `)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (workstream && workstream !== 'all') {
      query = query.eq('workstream_id', workstream);
    }
    if (priority && priority !== 'all') {
      query = query.eq('priority', priority);
    }

    const { data: actions, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch actions' }, { status: 500 });
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SwiftTrak';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Actions');

    // Define columns
    worksheet.columns = [
      { header: 'Title', key: 'title', width: 40 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Priority', key: 'priority', width: 12 },
      { header: 'Workstream', key: 'workstream', width: 20 },
      { header: 'Owner', key: 'owner', width: 20 },
      { header: 'Due Date', key: 'due_date', width: 18 },
      { header: 'Created', key: 'created_at', width: 18 },
      { header: 'Created By', key: 'created_by', width: 20 },
      { header: 'Completed', key: 'completed_at', width: 18 },
      { header: 'Completion Comment', key: 'completion_comment', width: 40 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDC2626' },
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Add data
    actions?.forEach((action: Record<string, unknown>) => {
      worksheet.addRow({
        title: action.title,
        description: action.description || '',
        status: action.status,
        priority: action.priority,
        workstream: (action.workstream as { name: string } | null)?.name || '',
        owner: (action.owner as { full_name: string } | null)?.full_name || 'Unassigned',
        due_date: action.due_date ? new Date(action.due_date as string).toLocaleString() : '',
        created_at: new Date(action.created_at as string).toLocaleString(),
        created_by: (action.creator as { full_name: string } | null)?.full_name || '',
        completed_at: action.completed_at ? new Date(action.completed_at as string).toLocaleString() : '',
        completion_comment: action.completion_comment || '',
      });
    });

    // Apply conditional formatting for status
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const statusCell = row.getCell('status');
      switch (statusCell.value) {
        case 'complete':
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } };
          break;
        case 'in_progress':
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
          break;
        case 'cancelled':
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } };
          break;
      }

      const priorityCell = row.getCell('priority');
      switch (priorityCell.value) {
        case 'critical':
          priorityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
          priorityCell.font = { color: { argb: 'FFFFFFFF' } };
          break;
        case 'high':
          priorityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
          break;
      }
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="SwiftTrak-Actions-${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
  }
}
