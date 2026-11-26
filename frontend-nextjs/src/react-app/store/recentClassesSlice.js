import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as api from '../api';

// Redux Toolkit slice: the class codes this person opened recently, newest first (at most 5), so they can rejoin
// with one tap. Kept in this browser only.
const MAX = 5;
const KEY = 'echosign.recentClasses';

const load = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((c) => typeof c === 'string').slice(0, MAX) : []; } catch { return []; }
};

const remember = (state, raw) => {
  const code = String(raw || '').toUpperCase().trim();
  if (!/^[A-Z0-9]{6}$/.test(code)) return;
  state.codes = [code, ...state.codes.filter((c) => c !== code)].slice(0, MAX);
};

// Async logic (createAsyncThunk): ask the server whether the class exists; only then is it remembered.
// A thunk has three outcomes (pending, fulfilled, rejected) that the slice can react to. The caller can await the result
// with .unwrap(): it returns the code, or throws the { status, message } given to rejectWithValue.
export const openClass = createAsyncThunk('recentClasses/open', async (code, { rejectWithValue }) => {
  try {
    await api.classrooms.get(code);
    return code;
  } catch (err) {
    return rejectWithValue({ status: err.status, message: err.message });
  }
});

const slice = createSlice({
  name: 'recentClasses',
  initialState: { codes: load() },
  reducers: {
    classOpened(state, action) { remember(state, action.payload); },
    recentCleared(state) { state.codes = []; },
  },
  extraReducers: (builder) => {
    builder.addCase(openClass.fulfilled, (state, action) => { remember(state, action.payload); });
  },
});

export const { classOpened, recentCleared } = slice.actions;
export const selectRecentCodes = (state) => state.recentClasses.codes;
export default slice.reducer;
