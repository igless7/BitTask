// services/firebase.js
import { 
    collection, 
    doc, 
    setDoc, 
    addDoc, 
    getDoc, 
    getDocs, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    serverTimestamp 
  } from "firebase/firestore";
  import { db, auth } from "../firebaseConfig";
  import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
  
  // ===== Autenticación =====
  export const registerUser = async (email, password, displayName) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Añadir información del usuario a Firestore
      await setDoc(doc(db, "users", userCredential.user.uid), {
        uid: userCredential.user.uid,
        email,
        displayName,
        createdAt: serverTimestamp()
      });
      
      return userCredential.user;
    } catch (error) {
      throw error;
    }
  };
  
  export const loginUser = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return userCredential.user;
    } catch (error) {
      throw error;
    }
  };
  
  export const logoutUser = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      throw error;
    }
  };
  
  // ===== Proyectos =====
  export const createProject = async (projectData) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Usuario no autenticado");
      
      // Crear proyecto
      const projectRef = await addDoc(collection(db, "projects"), {
        ...projectData,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      // Asignar al creador como gerente del proyecto
      await addDoc(collection(db, "projectMembers"), {
        projectId: projectRef.id,
        userId: currentUser.uid,
        role: "gerente",
        addedBy: currentUser.uid,
        addedAt: serverTimestamp()
      });
      
      // Crear tablero Kanban por defecto
      const boardRef = await addDoc(collection(db, "boards"), {
        projectId: projectRef.id,
        name: "Kanban",
        createdAt: serverTimestamp()
      });
      
      // Crear columnas por defecto para el tablero
      const defaultColumns = ["Por hacer", "En progreso", "Completado"];
      for (let i = 0; i < defaultColumns.length; i++) {
        await addDoc(collection(db, "columns"), {
          boardId: boardRef.id,
          name: defaultColumns[i],
          order: i,
          createdAt: serverTimestamp()
        });
      }
      
      return projectRef.id;
    } catch (error) {
      throw error;
    }
  };
  
  export const getProjects = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Usuario no autenticado");
      
      // Obtener IDs de proyectos donde el usuario es miembro
      const membershipQuery = query(
        collection(db, "projectMembers"),
        where("userId", "==", currentUser.uid)
      );
      
      const membershipSnapshot = await getDocs(membershipQuery);
      const projectIds = membershipSnapshot.docs.map(doc => doc.data().projectId);
      
      // Si no es miembro de ningún proyecto, devolver array vacío
      if (projectIds.length === 0) return [];
      
      // Obtener detalles de cada proyecto
      const projects = [];
      for (const projectId of projectIds) {
        const projectDoc = await getDoc(doc(db, "projects", projectId));
        if (projectDoc.exists()) {
          projects.push({
            id: projectDoc.id,
            ...projectDoc.data()
          });
        }
      }
      
      return projects;
    } catch (error) {
      throw error;
    }
  };
  
  export const getProjectDetails = async (projectId) => {
    try {
      const projectDoc = await getDoc(doc(db, "projects", projectId));
      
      if (!projectDoc.exists()) {
        throw new Error("Proyecto no encontrado");
      }
      
      return {
        id: projectDoc.id,
        ...projectDoc.data()
      };
    } catch (error) {
      throw error;
    }
  };
  
  // ===== Miembros del Proyecto =====
  export const addProjectMember = async (projectId, userEmail, role) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Usuario no autenticado");
      
      // Verificar si el usuario actual es gerente del proyecto
      const membershipQuery = query(
        collection(db, "projectMembers"),
        where("projectId", "==", projectId),
        where("userId", "==", currentUser.uid),
        where("role", "==", "gerente")
      );
      
      const membershipSnapshot = await getDocs(membershipQuery);
      if (membershipSnapshot.empty) {
        throw new Error("No tienes permisos para añadir miembros a este proyecto");
      }
      
      // Buscar el usuario por email
      const usersQuery = query(
        collection(db, "users"),
        where("email", "==", userEmail)
      );
      
      const usersSnapshot = await getDocs(usersQuery);
      if (usersSnapshot.empty) {
        throw new Error("Usuario no encontrado");
      }
      
      const userData = usersSnapshot.docs[0];
      const userId = userData.id;
      
      // Verificar si el usuario ya es miembro del proyecto
      const existingMemberQuery = query(
        collection(db, "projectMembers"),
        where("projectId", "==", projectId),
        where("userId", "==", userId)
      );
      
      const existingMemberSnapshot = await getDocs(existingMemberQuery);
      if (!existingMemberSnapshot.empty) {
        // Actualizar rol si ya es miembro
        const memberId = existingMemberSnapshot.docs[0].id;
        await updateDoc(doc(db, "projectMembers", memberId), {
          role,
          addedBy: currentUser.uid,
          addedAt: serverTimestamp()
        });
      } else {
        // Añadir como nuevo miembro
        await addDoc(collection(db, "projectMembers"), {
          projectId,
          userId,
          role,
          addedBy: currentUser.uid,
          addedAt: serverTimestamp()
        });
      }
      
      return true;
    } catch (error) {
      throw error;
    }
  };
  
  // ===== Tableros Kanban =====
  export const getProjectBoard = async (projectId) => {
    try {
      // Obtener tablero del proyecto
      const boardsQuery = query(
        collection(db, "boards"),
        where("projectId", "==", projectId)
      );
      
      const boardsSnapshot = await getDocs(boardsQuery);
      if (boardsSnapshot.empty) {
        throw new Error("Tablero no encontrado");
      }
      
      const boardData = boardsSnapshot.docs[0];
      const boardId = boardData.id;
      
      // Obtener columnas del tablero
      const columnsQuery = query(
        collection(db, "columns"),
        where("boardId", "==", boardId)
      );
      
      const columnsSnapshot = await getDocs(columnsQuery);
      const columns = columnsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => a.order - b.order);
      
      // Obtener tareas para cada columna
      for (const column of columns) {
        const tasksQuery = query(
          collection(db, "tasks"),
          where("columnId", "==", column.id)
        );
        
        const tasksSnapshot = await getDocs(tasksQuery);
        column.tasks = tasksSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })).sort((a, b) => a.order - b.order);
      }
      
      return {
        id: boardId,
        ...boardData.data(),
        columns
      };
    } catch (error) {
      throw error;
    }
  };
  
  // ===== Tareas =====
  export const createTask = async (columnId, taskData) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Usuario no autenticado");
      
      // Obtener la columna para verificar a qué proyecto pertenece
      const columnDoc = await getDoc(doc(db, "columns", columnId));
      if (!columnDoc.exists()) {
        throw new Error("Columna no encontrada");
      }
      
      const boardId = columnDoc.data().boardId;
      
      // Obtener el tablero para verificar a qué proyecto pertenece
      const boardDoc = await getDoc(doc(db, "boards", boardId));
      if (!boardDoc.exists()) {
        throw new Error("Tablero no encontrado");
      }
      
      const projectId = boardDoc.data().projectId;
      
      // Contar tareas existentes en la columna para determinar el orden
      const tasksQuery = query(
        collection(db, "tasks"),
        where("columnId", "==", columnId)
      );
      
      const tasksSnapshot = await getDocs(tasksQuery);
      const order = tasksSnapshot.size;
      
      // Crear la tarea
      const taskRef = await addDoc(collection(db, "tasks"), {
        ...taskData,
        columnId,
        projectId,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        order
      });
      
      return taskRef.id;
    } catch (error) {
      throw error;
    }
  };
  
  export const updateTaskStatus = async (taskId, newColumnId) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Usuario no autenticado");
      
      // Obtener la tarea
      const taskDoc = await getDoc(doc(db, "tasks", taskId));
      if (!taskDoc.exists()) {
        throw new Error("Tarea no encontrada");
      }
      
      // Contar tareas existentes en la nueva columna para determinar el orden
      const tasksQuery = query(
        collection(db, "tasks"),
        where("columnId", "==", newColumnId)
      );
      
      const tasksSnapshot = await getDocs(tasksQuery);
      const order = tasksSnapshot.size;
      
      // Actualizar la tarea
      await updateDoc(doc(db, "tasks", taskId), {
        columnId: newColumnId,
        updatedAt: serverTimestamp(),
        order
      });
      
      return true;
    } catch (error) {
      throw error;
    }
  };
  
  // ===== Comentarios =====
  export const addTaskComment = async (taskId, content) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Usuario no autenticado");
      
      // Crear comentario
      const commentRef = await addDoc(collection(db, "comments"), {
        taskId,
        userId: currentUser.uid,
        content,
        createdAt: serverTimestamp()
      });
      
      return commentRef.id;
    } catch (error) {
      throw error;
    }
  };
  
  export const getTaskComments = async (taskId) => {
    try {
      // Obtener comentarios de la tarea
      const commentsQuery = query(
        collection(db, "comments"),
        where("taskId", "==", taskId)
      );
      
      const commentsSnapshot = await getDocs(commentsQuery);
      const comments = commentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Para cada comentario, obtener información del usuario
      for (const comment of comments) {
        const userDoc = await getDoc(doc(db, "users", comment.userId));
        if (userDoc.exists()) {
          comment.user = {
            id: userDoc.id,
            ...userDoc.data()
          };
        }
      }
      
      return comments;
    } catch (error) {
      throw error;
    }
  };