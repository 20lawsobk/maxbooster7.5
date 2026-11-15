use std::time::SystemTime;

pub trait Clock: Send + Sync + 'static {
    fn now(&self) -> SystemTime;
}

#[derive(Clone)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> SystemTime {
        SystemTime::now()
    }
}
