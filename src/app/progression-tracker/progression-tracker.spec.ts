import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProgressionTracker } from './progression-tracker';

describe('ProgressionTracker', () => {
  let component: ProgressionTracker;
  let fixture: ComponentFixture<ProgressionTracker>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgressionTracker]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProgressionTracker);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
