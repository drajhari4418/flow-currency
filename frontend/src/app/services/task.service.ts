import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  is_complete: boolean;
  priority: TaskPriority;
  due_date: string | null; // ISO date string, e.g. "2026-09-12"
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private baseUrl = `${environment.apiUrl}/tasks`;

  constructor(private http: HttpClient) {}

  list(): Observable<Task[]> {
    return this.http.get<Task[]>(this.baseUrl);
  }

  create(
    title: string,
    priority: TaskPriority = 'medium',
    due_date: string | null = null,
    description?: string
  ): Observable<Task> {
    return this.http.post<Task>(this.baseUrl, { title, description, priority, due_date });
  }

  toggleComplete(task: Task): Observable<Task> {
    return this.http.put<Task>(`${this.baseUrl}/${task.id}`, {
      is_complete: !task.is_complete,
    });
  }

  update(id: string, changes: Partial<Pick<Task, 'title' | 'priority' | 'due_date' | 'description'>>): Observable<Task> {
    return this.http.put<Task>(`${this.baseUrl}/${id}`, changes);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
