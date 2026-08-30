import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  is_complete: boolean;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private baseUrl = `${environment.apiUrl}/tasks`;

  constructor(private http: HttpClient) {}

  list(): Observable<Task[]> {
    return this.http.get<Task[]>(this.baseUrl);
  }

  create(title: string, description?: string): Observable<Task> {
    return this.http.post<Task>(this.baseUrl, { title, description });
  }

  toggleComplete(task: Task): Observable<Task> {
    return this.http.put<Task>(`${this.baseUrl}/${task.id}`, {
      is_complete: !task.is_complete,
    });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
