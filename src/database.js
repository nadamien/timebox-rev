import Dexie from 'dexie';

// Define the database
export const db = new Dexie('TimeBoxDatabase');

// Define schemas
db.version(1).stores({
  tasks: '++id, title, description, duration, color, completed, createdAt, completedAt, priority, category',
  timeSlots: '++id, slotId, time, taskId, date',
  sessions: '++id, taskId, startTime, endTime, duration, completed, notes, date',
  settings: '++id, key, value'
});

// Task model
export class Task {
  constructor(title, description = '', duration = 30, priority = 'medium', category = 'general') {
    this.title = title;
    this.description = description;
    this.duration = duration;
    this.color = this.getRandomColor();
    this.completed = false;
    this.createdAt = new Date();
    this.completedAt = null;
    this.priority = priority;
    this.category = category;
  }

  getRandomColor() {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
      'bg-yellow-500', 'bg-red-500', 'bg-indigo-500', 'bg-teal-500',
      'bg-orange-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-rose-500'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

// Session tracking for timing data
export class Session {
  constructor(taskId, startTime) {
    this.taskId = taskId;
    this.startTime = startTime;
    this.endTime = null;
    this.duration = 0;
    this.completed = false;
    this.notes = '';
    this.date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  }

  end(notes = '') {
    this.endTime = new Date();
    this.duration = Math.floor((this.endTime - this.startTime) / 1000); // in seconds
    this.completed = true;
    this.notes = notes;
    return this;
  }
}

// Database operations
export const dbOperations = {
  // Tasks
  async addTask(task) {
    return await db.tasks.add(task);
  },

  async getTasks() {
    return await db.tasks.orderBy('createdAt').reverse().toArray();
  },

  async updateTask(id, changes) {
    return await db.tasks.update(id, changes);
  },

  async deleteTask(id) {
    // Also delete related sessions and time slots
    await db.sessions.where('taskId').equals(id).delete();
    await db.timeSlots.where('taskId').equals(id).delete();
    return await db.tasks.delete(id);
  },

  async completeTask(id) {
    return await db.tasks.update(id, { 
      completed: true, 
      completedAt: new Date() 
    });
  },

  // Sessions (timing data)
  async startSession(taskId) {
    const session = new Session(taskId, new Date());
    return await db.sessions.add(session);
  },

  async endSession(sessionId, notes = '') {
    const session = await db.sessions.get(sessionId);
    if (session) {
      session.end(notes);
      return await db.sessions.update(sessionId, session);
    }
  },

  async getSessions(taskId = null, date = null) {
    let collection = db.sessions;
    
    if (taskId) {
      collection = collection.where('taskId').equals(taskId);
    }
    
    if (date) {
      collection = collection.where('date').equals(date);
    }
    
    return await collection.orderBy('startTime').reverse().toArray();
  },

  // Time slots
  async saveTimeSlots(slots) {
    await db.timeSlots.clear();
    const slotsData = slots.map(slot => ({
      slotId: slot.id,
      time: slot.time,
      taskId: slot.task?.id || null,
      date: new Date().toISOString().split('T')[0]
    }));
    return await db.timeSlots.bulkAdd(slotsData);
  },

  async getTimeSlots(date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return await db.timeSlots.where('date').equals(targetDate).toArray();
  },

  // Analytics
  async getTaskStats(startDate, endDate) {
    const sessions = await db.sessions
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray();

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.completed).length;
    const totalTimeSpent = sessions.reduce((acc, s) => acc + s.duration, 0);
    
    return {
      totalSessions,
      completedSessions,
      totalTimeSpent,
      averageSessionTime: totalSessions > 0 ? totalTimeSpent / totalSessions : 0,
      completionRate: totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0
    };
  },

  async getProductivityData(days = 7) {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    const sessions = await db.sessions
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray();

    // Group by date
    const dailyData = {};
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];
      dailyData[date] = {
        date,
        sessions: 0,
        timeSpent: 0,
        tasksCompleted: 0
      };
    }

    sessions.forEach(session => {
      if (dailyData[session.date]) {
        dailyData[session.date].sessions++;
        dailyData[session.date].timeSpent += session.duration;
        if (session.completed) {
          dailyData[session.date].tasksCompleted++;
        }
      }
    });

    return Object.values(dailyData).reverse();
  }
};

// Initialize database
db.open().catch(err => {
  console.error('Failed to open database:', err);
});